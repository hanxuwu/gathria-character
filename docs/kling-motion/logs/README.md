# This batch's local checks

These logs were executed in the current motion-flow worktree, rather than copied
from historical verification. `e2e-initial.txt` retains the 27/28 first run and the
saved-project selection synchronization failure. The final full run is recorded
separately after that test wait is corrected. No retries or assertions were removed.

Unit and build checks cover the frozen runtime. Later changes only affect test
synchronization and evidence/documentation. Both compilation logs describe byte-
identical archives; see [reproducibility](../reproducibility.json).

The earlier main CI failure is distinct: [prior-main-ci.json](../prior-main-ci.json)
records the unavailable detailed logs and stopped download retries.
