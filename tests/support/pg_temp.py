"""Boots a throwaway Postgres for one test file and cleans it up on exit.

Every tests/db/*.py test used to build its own pgdata directory by hand and
call pgserver.get_server(PG) with no cleanup_mode -- which silently defaults
to 'stop': the server process is stopped at exit, but the ~40MB data
directory it leaves behind under /tmp is not. Across a session with many
`tests/run.sh db` (or full-suite) runs, these accumulate one per test per
run and can fill the disk entirely -- this actually happened (719 leftover
/tmp/eventhub-pg-* directories, 100% disk usage), and the resulting
out-of-space condition then caused cascading, misleading failures across
unrelated test suites until they were found and removed by hand.

pgserver already has the right tool for this -- get_server(pgdata,
cleanup_mode='delete') registers its own atexit hook that stops the server
and removes pgdata when the process exits, success or failure. The bug
was simply that no caller in this repo ever passed it. This wraps that
correct call in one place so every test file gets it by construction
instead of copy-pasting five lines that were wrong the same way sixteen
times.
"""
import os
import shutil
import tempfile

import pgserver


def temp_pg_uri(prefix: str = "eventhub-pg-") -> str:
    """Starts a fresh, empty Postgres and returns its connection URI.

    The data directory lives outside the repo on purpose (it's ~40MB of
    files owned by another user, which git cannot read and eslint walks),
    and is deleted automatically -- by pgserver's own atexit hook, not a
    cleanup step a caller has to remember -- when this process exits.

    pgdata is the mkdtemp() directory itself, not a "data" subdirectory
    inside it (the original, pre-cleanup version of this code used such a
    subdirectory for no functional reason) -- cleanup_mode='delete' only
    rmtrees pgdata itself, so nesting it one level deeper than necessary
    would leave an empty wrapper directory behind on every single run.
    """
    pgdata = tempfile.mkdtemp(prefix=prefix)
    os.chmod(pgdata, 0o777)
    return pgserver.get_server(pgdata, cleanup_mode="delete").get_uri()
