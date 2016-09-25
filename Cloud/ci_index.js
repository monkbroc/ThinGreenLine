// Can only be run on hook.io
var id = hook.params.id;
if (!id) {
  listAllRepos();
} else if (id.match(/^\d+$/)) {
  repoById(id);
} else {
  repoByName(id);
}

function listAllRepos() {
  loadRepos(function (repos) {
    hook.res.write("Add an index or name to the URL path for more specific info\n\n");

    var i;
    for (i = 0; i < repos.length; i++) {
      var repo = repos[i];
      hook.res.write(i + ": " + repo.name + "\n");
    }
    hook.res.end();
  });
}

function repoById(id) {
  loadRepos(function (repos) {
    var repo = repos[id];
    hook.res.end((repo && repo.name) || "Not found");
  });
}

function repoByName(name) {
  loadRepos(function (repos) {
    var i;
    for (i = 0; i < repos.length; i++) {
      var repo = repos[i];
      if (repo.name === name) {
        hook.res.end(i);
        return;
      }
    }
    hook.res.end("Not found");
  });
}

function loadRepos(cb) {
  hook.datastore.get('ci_repos', function (err, repos) {
    if (err) {
      hook.res.end("Error");
      return;
    }
    cb(repos);
  });
}

