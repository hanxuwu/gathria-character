"""Route each declared finishing revision to its independent reversible proof.

The old contour/coverage assertions still run on the verified previous native
layer. A path may have only one finishing proof; no unregistered fallback is
allowed to reinterpret a changed archive as historical art.
"""
import importlib.util
import wardrobe_finish_audit as neckline

LAYERS = [neckline]
if importlib.util.find_spec("side_finish_audit") is not None:
    import side_finish_audit
    LAYERS.append(side_finish_audit)


def _layer(path):
    matches = [layer for layer in LAYERS if layer.is_finished(path)]
    if len(matches) > 1:
        raise ValueError(f"Overlapping finishing revisions: {path}")
    return matches[0] if matches else None


def is_finished(path):
    return _layer(path) is not None


def _required(path):
    layer = _layer(path)
    if layer is None:
        raise ValueError(f"No reviewed finishing revision: {path}")
    return layer


def asset_revision(path):
    return _required(path).asset_revision(path)


def validated_previous_manifest(path, manifest):
    return _required(path).validated_previous_manifest(path, manifest)


def undo_finish_frame(path, frame_id, rgba, owned):
    return _required(path).undo_finish_frame(path, frame_id, rgba, owned)
