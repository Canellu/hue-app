export const INSPECTOR_TRANSITION_EVENT = "hue:inspector-transition";

export interface InspectorTransitionDetail {
  proceed: () => void;
}

export const requestInspectorTransition = (proceed: () => void) => {
  const event = new CustomEvent<InspectorTransitionDetail>(
    INSPECTOR_TRANSITION_EVENT,
    {
      cancelable: true,
      detail: { proceed },
    },
  );
  window.dispatchEvent(event);
  if (!event.defaultPrevented) proceed();
};
