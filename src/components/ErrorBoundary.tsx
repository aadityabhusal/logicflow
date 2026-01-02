import { IconButton } from "@/ui/IconButton";
import React, { ReactNode } from "react";
import { FaCircleXmark } from "react-icons/fa6";

export class ErrorBoundary extends React.Component<{
  displayError?: boolean;
  children?: ReactNode;
  onRemove?: () => void;
  fallback?: ReactNode;
}> {
  state = { errorMessage: "" };

  static getDerivedStateFromError(error: Error) {
    return { errorMessage: error.toString() };
  }

  render() {
    if (this.state.errorMessage) {
      return this.props.fallback ? (
        this.props.fallback
      ) : this.props.displayError ? (
        <div className="flex items-start gap-1 outline outline-border relative">
          <span className="text-error">{this.state.errorMessage}</span>
          {this.props.onRemove && (
            <IconButton
              className="absolute -top-1.5 -right-1 text-border bg-white rounded-full"
              icon={FaCircleXmark}
              title="Remove"
              size={12}
              onClick={this.props.onRemove}
            />
          )}
        </div>
      ) : null;
    }
    return this.props.children;
  }
}
