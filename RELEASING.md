# Releasing

1. If you haven't already, switch to the master branch, ensure that you have no changes, and pull from origin.

    ```sh
    $ git checkout master
    $ git status
    $ git pull <remote> master --rebase
    ```

1. Bump package version

    ```sh
    $ npm version [major | minor | patch]
    ```

1. `postversion` script will push tags to the repo, publish NPM package, and open GitHub release page.
