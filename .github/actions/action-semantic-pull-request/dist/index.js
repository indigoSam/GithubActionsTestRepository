/******/ (() => { // webpackBootstrap
/******/ 	var __webpack_modules__ = ({

/***/ 980:
/***/ ((module) => {

const ENUM_SPLIT_REGEX = /[,\s]\s*/;

module.exports = {
  parseEnum(input) {
    return input
      .split(ENUM_SPLIT_REGEX)
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
  },

  parseBoolean(input) {
    return JSON.parse(input.trim());
  },

  parseString(input) {
    return input;
  }
};


/***/ }),

/***/ 347:
/***/ ((module) => {

module.exports = function formatMessage(message, values) {
  let formatted = message;
  if (values) {
    Object.entries(values).forEach(([key, value]) => {
      formatted = formatted.replace(new RegExp(`{${key}}`, 'g'), value);
    });
  }
  return formatted;
};


/***/ }),

/***/ 336:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

const core = __nccwpck_require__(518);
const github = __nccwpck_require__(832);
const parseConfig = __nccwpck_require__(918);
const validatePrTitle = __nccwpck_require__(311);

module.exports = async function run() {
  try {
    const {
      types,
      scopes,
      requireScope,
      wip,
      subjectPattern,
      subjectPatternError,
      validateSingleCommit,
      validateSingleCommitMatchesPrTitle,
      githubBaseUrl
    } = parseConfig();

    const client = github.getOctokit(process.env.GITHUB_TOKEN, {
      baseUrl: githubBaseUrl
    });

    const contextPullRequest = github.context.payload.pull_request;
    if (!contextPullRequest) {
      throw new Error(
        "This action can only be invoked in `pull_request_target` or `pull_request` events. Otherwise the pull request can't be inferred."
      );
    }

    const owner = contextPullRequest.base.user.login;
    const repo = contextPullRequest.base.repo.name;

    // The pull request info on the context isn't up to date. When
    // the user updates the title and re-runs the workflow, it would
    // be outdated. Therefore fetch the pull request via the REST API
    // to ensure we use the current title.
    const {data: pullRequest} = await client.rest.pulls.get({
      owner,
      repo,
      pull_number: contextPullRequest.number
    });

    // Pull requests that start with "[WIP] " are excluded from the check.
    const isWip = wip && /^\[WIP\]\s/.test(pullRequest.title);

    let validationError;
    if (!isWip) {
      try {
        await validatePrTitle(pullRequest.title, {
          types,
          scopes,
          requireScope,
          subjectPattern,
          subjectPatternError
        });

        if (validateSingleCommit) {
          const commits = [];
          let nonMergeCommits = [];

          for await (const response of client.paginate.iterator(
            client.rest.pulls.listCommits,
            {
              owner,
              repo,
              pull_number: contextPullRequest.number
            }
          )) {
            commits.push(...response.data);

            // GitHub does not count merge commits when deciding whether to use
            // the PR title or a commit message for the squash commit message.
            nonMergeCommits = commits.filter(
              (commit) => commit.parents.length < 2
            );

            // We only need two non-merge commits to know that the PR
            // title won't be used.
            if (nonMergeCommits.length >= 2) break;
          }

          // If there is only one (non merge) commit present, GitHub will use
          // that commit rather than the PR title for the title of a squash
          // commit. To make sure a semantic title is used for the squash
          // commit, we need to validate the commit title.
          if (nonMergeCommits.length === 1) {
            try {
              await validatePrTitle(nonMergeCommits[0].commit.message, {
                types,
                scopes,
                requireScope,
                subjectPattern,
                subjectPatternError
              });
            } catch (error) {
              throw new Error(
                `Pull request has only one commit and it's not semantic; this may lead to a non-semantic commit in the base branch (see https://github.community/t/how-to-change-the-default-squash-merge-commit-message/1155). Amend the commit message to match the pull request title, or add another commit.`
              );
            }

            if (validateSingleCommitMatchesPrTitle) {
              const commitTitle =
                nonMergeCommits[0].commit.message.split('\n')[0];
              if (commitTitle !== pullRequest.title) {
                throw new Error(
                  `The pull request has only one (non-merge) commit and in this case Github will use it as the default commit message when merging. The pull request title doesn't match the commit though ("${pullRequest.title}" vs. "${commitTitle}"). Please update the pull request title accordingly to avoid surprises.`
                );
              }
            }
          }
        }
      } catch (error) {
        validationError = error;
      }
    }

    if (wip) {
      const newStatus =
        isWip || validationError != null ? 'pending' : 'success';

      // When setting the status to "pending", the checks don't
      // complete. This can be used for WIP PRs in repositories
      // which don't support draft pull requests.
      // https://developer.github.com/v3/repos/statuses/#create-a-status
      await client.request('POST /repos/:owner/:repo/statuses/:sha', {
        owner,
        repo,
        sha: pullRequest.head.sha,
        state: newStatus,
        target_url: 'https://github.com/amannn/action-semantic-pull-request',
        description: isWip
          ? 'This PR is marked with "[WIP]".'
          : validationError
          ? 'PR title validation failed'
          : 'Ready for review & merge.',
        context: 'action-semantic-pull-request'
      });
    }

    if (!isWip && validationError) {
      throw validationError;
    }
  } catch (error) {
    core.setFailed(error.message);
  }
};


/***/ }),

/***/ 918:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

const ConfigParser = __nccwpck_require__(980);

module.exports = function parseConfig() {
  let types;
  if (process.env.INPUT_TYPES) {
    types = ConfigParser.parseEnum(process.env.INPUT_TYPES);
  }

  let scopes;
  if (process.env.INPUT_SCOPES) {
    scopes = ConfigParser.parseEnum(process.env.INPUT_SCOPES);
  }

  let requireScope;
  if (process.env.INPUT_REQUIRESCOPE) {
    requireScope = ConfigParser.parseBoolean(process.env.INPUT_REQUIRESCOPE);
  }

  let subjectPattern;
  if (process.env.INPUT_SUBJECTPATTERN) {
    subjectPattern = ConfigParser.parseString(process.env.INPUT_SUBJECTPATTERN);
  }

  let subjectPatternError;
  if (process.env.INPUT_SUBJECTPATTERNERROR) {
    subjectPatternError = ConfigParser.parseString(
      process.env.INPUT_SUBJECTPATTERNERROR
    );
  }

  let wip;
  if (process.env.INPUT_WIP) {
    wip = ConfigParser.parseBoolean(process.env.INPUT_WIP);
  }

  let validateSingleCommit;
  if (process.env.INPUT_VALIDATESINGLECOMMIT) {
    validateSingleCommit = ConfigParser.parseBoolean(
      process.env.INPUT_VALIDATESINGLECOMMIT
    );
  }

  let validateSingleCommitMatchesPrTitle;
  if (process.env.INPUT_VALIDATESINGLECOMMITMATCHESPRTITLE) {
    validateSingleCommitMatchesPrTitle = ConfigParser.parseBoolean(
      process.env.INPUT_VALIDATESINGLECOMMITMATCHESPRTITLE
    );
  }

  let githubBaseUrl;
  if (process.env.INPUT_GITHUBBASEURL) {
    githubBaseUrl = ConfigParser.parseString(process.env.INPUT_GITHUBBASEURL);
  }

  return {
    types,
    scopes,
    requireScope,
    wip,
    subjectPattern,
    subjectPatternError,
    validateSingleCommit,
    validateSingleCommitMatchesPrTitle,
    githubBaseUrl
  };
};


/***/ }),

/***/ 311:
/***/ ((module, __unused_webpack_exports, __nccwpck_require__) => {

const conventionalCommitsConfig = __nccwpck_require__(759);
const conventionalCommitTypes = __nccwpck_require__(86);
const parser = (__nccwpck_require__(426).sync);
const formatMessage = __nccwpck_require__(347);

const defaultTypes = Object.keys(conventionalCommitTypes.types);

module.exports = async function validatePrTitle(
  prTitle,
  {types, scopes, requireScope, subjectPattern, subjectPatternError} = {}
) {
  if (!types) types = defaultTypes;

  const {parserOpts} = await conventionalCommitsConfig();
  const result = parser(prTitle, parserOpts);

  function printAvailableTypes() {
    return `Available types:\n${types
      .map((type) => {
        let bullet = ` - ${type}`;

        if (types === defaultTypes) {
          bullet += `: ${conventionalCommitTypes.types[type].description}`;
        }

        return bullet;
      })
      .join('\n')}`;
  }

  function isUnknownScope(s) {
    return scopes && !scopes.includes(s);
  }

  if (!result.type) {
    throw new Error(
      `No release type found in pull request title "${prTitle}". Add a prefix to indicate what kind of release this pull request corresponds to. For reference, see https://www.conventionalcommits.org/\n\n${printAvailableTypes()}`
    );
  }

  if (!result.subject) {
    throw new Error(`No subject found in pull request title "${prTitle}".`);
  }

  if (!types.includes(result.type)) {
    throw new Error(
      `Unknown release type "${
        result.type
      }" found in pull request title "${prTitle}". \n\n${printAvailableTypes()}`
    );
  }

  if (requireScope && !result.scope) {
    let msg = `No scope found in pull request title "${prTitle}".`;
    if (scopes) {
      msg += ` Use one of the available scopes: ${scopes.join(', ')}.`;
    }

    throw new Error(msg);
  }

  const givenScopes = result.scope
    ? result.scope.split(',').map((scope) => scope.trim())
    : undefined;
  const unknownScopes = givenScopes ? givenScopes.filter(isUnknownScope) : [];
  if (scopes && unknownScopes.length > 0) {
    throw new Error(
      `Unknown ${
        unknownScopes.length > 1 ? 'scopes' : 'scope'
      } "${unknownScopes.join(
        ','
      )}" found in pull request title "${prTitle}". Use one of the available scopes: ${scopes.join(
        ', '
      )}.`
    );
  }

  function throwSubjectPatternError(message) {
    if (subjectPatternError) {
      message = formatMessage(subjectPatternError, {
        subject: result.subject,
        title: prTitle
      });
    }

    throw new Error(message);
  }

  if (subjectPattern) {
    const match = result.subject.match(new RegExp(subjectPattern));

    if (!match) {
      throwSubjectPatternError(
        `The subject "${result.subject}" found in pull request title "${prTitle}" doesn't match the configured pattern "${subjectPattern}".`
      );
    }

    const matchedPart = match[0];
    if (matchedPart.length !== result.subject.length) {
      throwSubjectPatternError(
        `The subject "${result.subject}" found in pull request title "${prTitle}" isn't an exact match for the configured pattern "${subjectPattern}". Please provide a subject that matches the whole pattern exactly.`
      );
    }
  }
};


/***/ }),

/***/ 518:
/***/ ((module) => {

module.exports = eval("require")("@actions/core");


/***/ }),

/***/ 832:
/***/ ((module) => {

module.exports = eval("require")("@actions/github");


/***/ }),

/***/ 759:
/***/ ((module) => {

module.exports = eval("require")("conventional-changelog-conventionalcommits");


/***/ }),

/***/ 86:
/***/ ((module) => {

module.exports = eval("require")("conventional-commit-types");


/***/ }),

/***/ 426:
/***/ ((module) => {

module.exports = eval("require")("conventional-commits-parser");


/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __nccwpck_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		var threw = true;
/******/ 		try {
/******/ 			__webpack_modules__[moduleId](module, module.exports, __nccwpck_require__);
/******/ 			threw = false;
/******/ 		} finally {
/******/ 			if(threw) delete __webpack_module_cache__[moduleId];
/******/ 		}
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/compat */
/******/ 	
/******/ 	if (typeof __nccwpck_require__ !== 'undefined') __nccwpck_require__.ab = __dirname + "/";
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry need to be wrapped in an IIFE because it need to be isolated against other modules in the chunk.
(() => {
const run = __nccwpck_require__(336);

run();

})();

module.exports = __webpack_exports__;
/******/ })()
;