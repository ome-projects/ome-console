/**
 * Annotations OME reads on ServingRuntimes and ClusterServingRuntimes. The runtime detail page's
 * inheritance view uses the same keys.
 */

/** Names the parent whose spec this runtime inherits; resolved among runtimes of the same scope. */
export const INHERIT_FROM_ANNOTATION = 'ome.io/inherit-from'

/** `"true"` marks a runtime that exists only to be inherited from; the webhook then requires `spec.disabled: true`. */
export const RUNTIME_PROFILE_ANNOTATION = 'ome.io/runtime-profile'
