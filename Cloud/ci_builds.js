require('dotenv').config();

var env = process.env;
var request = require('request');
var fs = require('fs');

function loadRepos() {
  try {
    return JSON.parse(fs.readFileSync('repos.json'));
  } catch (e) {
    return [];
  }
}

function storeRepos(repos) {
  fs.writeFileSync('repos.json', JSON.stringify(repos, true, 2));
  return repos;
}

function showResults(msg) {
  console.log(msg);
}

function getTravisRepositories(api, token) {
  return new Promise(function (fulfill, reject) {
    const url = 'https://' + api + '/owner/spark/repos?include=repository.current_build&active=true';
    request({
      url: url,
      headers: {
        'Authorization': 'token ' + token,
        'Accept': 'application/vnd.travis-ci.3+json'
      }
    }, function (error, response, body) {
      if (error) {
        reject(error);
      }

      body = JSON.parse(body);
      var repositories = body.repositories;
      var simpleRepositories = repositories.map(simplifyRepository);

      fulfill(simpleRepositories);
    });
  });
}

function simplifyRepository(repository) {
  var state = repository.current_build && repository.current_build.state;
  return {
    name: repository.name,
    state: normalizeState(state),
  };
}

function normalizeState(state) {
  // See https://github.com/travis-ci/travis-api/blob/master/lib/travis/model/build/states.rb#L24
  if (state == 'passed') {
    return 'passed';
  } else if (state == 'failed' || state == 'errored' || state == 'cancelled') {
    return 'failed';
  } else {
    return 'started';
  }
}

function getAllTravisRepos() {
  return Promise.all([
      getTravisRepositories('api.travis-ci.org', env.TRAVIS_ORG_TOKEN),
      getTravisRepositories('api.travis-ci.com', env.TRAVIS_COM_TOKEN)
  ]).then(function (results) {
    var publicRepos = results[0];
    var privateRepos = results[1];
    return publicRepos.concat(privateRepos);
  });
}

function getNextIndex(repos) {
  return repos.reduce(function (index, repo) {
    return Math.max(index, repo.index === 'none' ? index : repo.index);
  }, 0) + 1;
}

function updateRepoInList(repos, repo) {
  var i = repos.findIndex(function (r) {
    return r.name === repo.name;
  });
  if (i >= 0) {
    repos[i] = repo;
  } else {
    repos.push(repo);
  }
  return repos;
}

function updateRepoStates(repos, newRepos) {
  newRepos.forEach(function (newRepo) {
    var repo = repoByName(repos, newRepo.name);
    if (repo) {
      repo.state = newRepo.state;
    } else {
      repo = Object.assign({}, newRepo, { index: getNextIndex(repos) });
    }
    repos = updateRepoInList(repos, repo);
  });

  return repos;
}

function repoByName(repos, name) {
  return repos.find(function (repo) {
    return repo.name === name;
  });
}

function repoByIndex(repos, index) {
  return repos.find(function (repo) {
    return repo.index === index;
  });
}

function countActiveRepos(repos) {
  return repos.reduce(function (sum, repo) {
    return sum + (repo.index === 'none' ? 0 : 1);
  }, 0);
}

function encodeState(state) {
  var encoding = {
    passed: 1,
    failed: 2,
    started: 3
  };
  return encoding[state] || 0;
}

function toHexString(arr) {
  return arr.map(function (n) { return n.toString(16); }).join('');
}

function encodeAllStates(repos) {
  // Each pair of state is encoded to one hex digit, the first in the
  // high nibble and the second in the low nibble
  var encoded = [];
  var i;
  var count = Object.keys(repos).length;
  for (i = 0; i < count; i++) {
    var repo = repoByIndex(repos, i) || {};
    var s = encodeState(repo.state);
    if (i % 2 == 0) {
      encoded.push(s << 2);
    } else {
      encoded[encoded.length - 1] += s;
    }
  }

  return toHexString(encoded);
}

function encodeAndPublish(repos) {
  return new Promise(function (fulfill, reject) {
    var encoded = encodeAllStates(repos);

    showResults('Sending build status ' + encoded);
    var token = env.PARTICLE_CI_TOKEN;
    var productId = env.PARTICLE_CI_PRODUCT_ID;
    var url = 'https://api.particle.io/v1/products/' + productId + '/events';
    request.post({
      url: url,
      form: {
        name: 'build',
        data: encoded,
        private: true
      },
      auth: {
        bearer: token
      }
    }, function (error, response, body) {
      if (error) {
        reject(error);
      }

      fulfill(body);
    });
  }).then(function () {
    showResults("Published build status for " + countActiveRepos(repos) + " repos");
  });
}

var githubRepos = JSON.parse(fs.readFileSync('../../particle_github_repos.json'));
function repoDate(name) {
  var repo = githubRepos.find(function (r) {
    return r.name === name;
  });
  if (repo) {
    return new Date(repo.created_at);
  } else {
    return new Date();
  }
}



getAllTravisRepos()
.then(function (newRepos) {
  var oldRepos = loadRepos();
  return updateRepoStates(oldRepos, newRepos);
})
.then(storeRepos)
.then(encodeAndPublish)
.catch(function (err) {
  console.error("Error updating build info", err);
  console.error(err.stack);
});

