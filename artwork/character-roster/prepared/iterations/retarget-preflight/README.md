# Bounded motion-profile diagnosis

These numerical trials use the actual initial assembled projects retained in
`../original-motion/`. They inspect the existing renderer without rewriting
source pixels or runtime code. The twelve keys, 18 fps, sequence, anatomical
chains, source shoe axes and upper-body motion stay fixed except for the uniform
reported parameter transforms.

Stride/lift factors alone did not produce a valid Nora V2 loop. Uniform +3/+5
bodyBob and the bounded +4 fallback also failed support in contact keys. A
zero-travel diagnostic succeeded but was rejected as an animation solution.
No invalid numeric profile is presented as a successful running GIF.
