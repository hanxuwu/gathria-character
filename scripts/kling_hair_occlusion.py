"""Bounded raster-fringe ownership, without extending into neck/clothing.

The original head box misses opaque or antialiased scalp pixels by up to 2.5
native pixels in the reviewed sources. Allow authored hair over a three-pixel
top/side envelope; retain the exact lower edge and explicit foreground masks.
"""
def hair_occlusion_bounds(head, width, height):
    left = max(0, head['x'] - 3)
    top = max(0, head['y'] - 3)
    right = min(width, head['x'] + head['width'] + 3)
    bottom = head['y'] + head['height']
    assert bottom <= height
    return {'x': left, 'y': top, 'width': right - left, 'height': bottom - top}
