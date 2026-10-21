# Incomplete first browser recording attempt

The actual male daily/wedding UI exports and male daily independent playback
completed, but this run stopped when Playwright tried to start a video recorder:
its expected FFmpeg binary was not installed. The report is retained as a failed
run, not counted as completed final verification. Paths in this historical
report identify that run's outputs; the completed final outputs are in the
parent directories and have their own hashes.

The automatic Playwright FFmpeg download returned HTTP403. The installed system
FFmpeg with libvpx was then exposed through an isolated workspace Playwright
cache and a short WebM was successfully recorded and decoded before rerunning
the complete capture. No application or artwork changes were needed.
