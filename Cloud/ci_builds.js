var hookio = typeof hook !== 'undefined';

if (!hookio) require('dotenv').config();

var env = hookio ? hook.env : process.env;
var request = require('request');
var Particle = require('particle-api-js');

function storeRepos(repos) {
  if (hookio) {
    hook.datastore.set('ci_repos', repos);
  }
}

function showResults(msg) {
  if (hookio) {
    hook.res.end(msg);
  } else {
    console.log(msg);
  }
}

function getRepositories(api, token) {
  return new Promise(function (fulfill, reject) {
    request({
      url: 'https://' + api + '/owner/spark/repos?include=repository.current_build&active=true',
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
    id: repository.id,
    name: repository.name,
    state: normalizeState(state)
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

function sortById(repos) {
  return repos.sort(function (a, b) {
    return a.id - b.id;
  });
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
  storeRepos(repos);

  var encoded = encodeAllStates(repos);

  var token = env.PARTICLE_CI_TOKEN;
  var device = env.PARTICLE_CI_DEVICE;
  var particle = new Particle();
  return particle.callFunction({ deviceId: device, name: 'build', argument: encoded, auth: token }).then(function () {
    showResults("Published build status for " + repos.length + " repos");
  });
}

getAllRepos()
.then(sortById)
.then(encodeAndPublish)
.catch(function (err) {
  showResults("Error updating build info\n" + err);
});
