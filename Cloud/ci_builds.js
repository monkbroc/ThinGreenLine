require('dotenv').config();

var env = process.env;
var request = require('request');
var fs = require('fs');

function loadRepos() {
  try {
    return JSON.parse(fs.readFileSync('repos.json'));
  } catch (e) {
    return {};
  }
}

function storeRepos(repos) {
  fs.writeFileSync('repos.json', JSON.stringify(repos, true, 2));
}

function showResults(msg) {
  console.log(msg);
}

function getRepositories(api, token) {
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
    date: repoDate(repository.name),
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

function getAllRepos() {
  return Promise.all([
      getRepositories('api.travis-ci.org', env.TRAVIS_ORG_TOKEN),
      getRepositories('api.travis-ci.com', env.TRAVIS_COM_TOKEN)
  ]).then(function (results) {
    var publicRepos = results[0];
    var privateRepos = results[1];
    return publicRepos.concat(privateRepos);
  });
}

function sortByDate(repos) {
  return repos.sort(function (a, b) {
    return a.date - b.date;
  });
}

var blacklist = [
'particle-store',
'end-to-end-tests',
'elite-feedback',
'tutum-udp-proxy',
'spark-cli',
'sparkjs',
'buildpack-0.3.x',
];

function addIndex(repos) {
  console.log('addIndex');
  var index = 0;
  repos.forEach(function (repo) {
    if (blacklist.indexOf(repo.name) >= 0) {
      repo.index = 'none';
    } else {
      repo.index = index;
      index += 1;
    }
  });
  return repos;
}

function removeDate(repos) {
  console.log('removeDate');
  repos.forEach(function (repo) {
    delete repo.date;
  });
  return repos;
}

function makeReposHash(repos) {
  console.log('makeReposHash');
  return repos.reduce(function (hash, repo) {
    var obj = Object.assign({}, repo);
    delete obj.name;

    hash[repo.name] = obj;
    return hash;
  }, {});
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
  for (i = 0; i < repos.length; i++) {
    var repo = repos[i];
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
    storeRepos(repos);

    var encoded = encodeAllStates(repos);

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
    showResults("Published build status for " + repos.length + " repos");
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



getAllRepos()
.then(function (newRepos) {
  var oldRepos = loadRepos();
  var repos = updateStates(oldRepos, newRepos);
})
.then(sortByDate)
.then(addIndex)
.then(removeDate)
.then(makeReposHash)
.then(function (repos) {
  console.log('done');
  storeRepos(repos);

  console.log('id,name,state');
  Object.keys(repos).forEach(function (name) {
    var repo = repos[name];
    console.log(repo.index + ',' + name + ',' + repo.state);
  });
});

//getAllRepos()
//.then(sortById)
//.then(encodeAndPublish)
//.catch(function (err) {
//  showResults("Error updating build info\n" + err);
//});
