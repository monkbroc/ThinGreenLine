var fs = require('fs');

function loadRepos() {
  try {
    return JSON.parse(fs.readFileSync('repos.json'));
  } catch (e) {
    return [];
  }
}

function printField(value, n) {
  var str = value.toString();
  if (str.length < n) {
    str += ' '.repeat(n - str.length);
  }
  return str;
}

function printRepos(repos) {
  console.log(printField('Index', 8) + printField('Name', 40) + printField('State', 8));
  repos.forEach(function (repo) {
    if (repo.index === 'none') {
      return;
    }

    console.log(printField(repo.index, 8) + printField(repo.name, 40) + printField(repo.state, 8));
  });
}

var repos = loadRepos();
printRepos(repos);
