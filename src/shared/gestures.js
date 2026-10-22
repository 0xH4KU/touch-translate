  const SWIPE_MIN_X = 60;
  const SWIPE_FLICK_MIN_X = 24;
  const SWIPE_INTENT_PX = 16;
  const SWIPE_SCROLL_PX = 24;
  const SWIPE_PROJECTION_MS = 90;
  const SAFARI_EDGE_X = 12;

  function projectedSwipeX(dx, velocityX = 0) {
    return dx + velocityX * SWIPE_PROJECTION_MS;
  }

  function swipeIntent(dx, dy) {
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    if (dx >= SWIPE_INTENT_PX && dx >= absY) return "horizontal";
    if (
      dx <= -SWIPE_INTENT_PX ||
      (absY >= SWIPE_SCROLL_PX && absY > absX * 1.25)
    ) {
      return "cancel";
    }
    return "possible";
  }

  function swipeShouldCommit(dx, velocityX = 0, ready = false) {
    if (ready) return dx >= SWIPE_FLICK_MIN_X;
    return (
      dx >= SWIPE_MIN_X ||
      (dx >= SWIPE_FLICK_MIN_X &&
        velocityX > 0 &&
        projectedSwipeX(dx, velocityX) >= SWIPE_MIN_X)
    );
  }

  function swipeVelocity(samples) {
    const first = samples[0];
    const last = samples[samples.length - 1];
    return first && last && last.at > first.at
      ? (last.x - first.x) / (last.at - first.at)
      : 0;
  }

  function pointFor(touches, identifier) {
    return Array.from(touches || []).find(
      (touch) => touch.identifier === identifier,
    );
  }

  function recordSwipeSample(gesture, x, at) {
    gesture.samples.push({ at, x });
    gesture.samples = gesture.samples
      .filter((sample) => at - sample.at <= 100)
      .slice(-4);
    return swipeVelocity(gesture.samples);
  }
