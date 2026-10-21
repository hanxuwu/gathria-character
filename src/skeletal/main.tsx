// The native candidate is opt-in. Ordinary Skin Studio keeps its existing
// bootstrap, assets, editor state and 192 × 256 rendering unchanged.
if (new URLSearchParams(window.location.search).get("study") === "kling-male") {
  void import("./NativeStudy").then(({ mountNativeStudy }) =>
    mountNativeStudy(),
  );
} else {
  void import("./Studio");
}
