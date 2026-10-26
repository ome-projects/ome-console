package runtimeselect

import (
	"fmt"
	"slices"
)

// IsDeploymentMode reports whether mode is a deployment mode selection recognizes. OME treats
// any other value, a misspelling included, as no mode.
func IsDeploymentMode(mode string) bool {
	switch mode {
	case ModeRawDeployment, ModeMultiNode, ModeVirtualDeployment, ModeOMENative:
		return true
	}
	return false
}

// acceleratorsOK reports whether the runtime lists every requested class. With no request every
// runtime passes; with one, a runtime that lists no classes fails. Names match exactly, so an
// empty name is a class no runtime lists.
func acceleratorsOK(rt Runtime, requested []string) bool {
	for _, class := range requested {
		if !slices.Contains(rt.AcceleratorClasses, class) {
			return false
		}
	}
	return true
}

// modeMismatch returns why the runtime's deployment modes conflict with the request's, or ""
// when they do not. The engine's modes are compared, then the decoder's. A component's modes
// conflict only when both sides declare one and they differ.
func modeMismatch(rt Runtime, req Request) string {
	if reason := componentModeMismatch("engine", rt.EngineMode, req.EngineMode); reason != "" {
		return reason
	}
	return componentModeMismatch("decoder", rt.DecoderMode, req.DecoderMode)
}

func componentModeMismatch(component, runtimeMode, requestedMode string) string {
	if !IsDeploymentMode(runtimeMode) || !IsDeploymentMode(requestedMode) || runtimeMode == requestedMode {
		return ""
	}
	return fmt.Sprintf("runtime %s deployment mode %s does not match requested %s deployment mode %s",
		component, runtimeMode, component, requestedMode)
}
