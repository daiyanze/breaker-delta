/** @jsxImportSource preact */
/**
 * The one button shape of the site (`design/system/components/Button`,
 * #112): square, outlined, inverted on hover. Three variants: `default`
 * (a 2px outline), `solid` (the page's one main action) and `secondary`
 * (a 1px outline in small type, for the masthead's tools and Copy link),
 * written as `data-variant` beside the class `Button`.
 *
 * With `href` it is a link, for an action that goes to another page; without
 * it a `<button>`, `type="button"` unless it submits a form. Its text says
 * what happens ("Read all 214 echoes"), in the page's language: the page
 * passes finished text. Styles: `Button.css`.
 */
import type { ComponentChildren, VNode } from "preact";

export type ButtonVariant = "default" | "solid" | "secondary";

interface ButtonCommon {
  variant?: ButtonVariant;
  /** What the button shows: its text, and an icon (`.Button-icon`) before it if any. */
  children: ComponentChildren;
}

export type ButtonProps = ButtonCommon &
  ({ href: string; type?: never } | { href?: never; type?: "button" | "submit" });

export function Button(props: ButtonProps): VNode {
  const variant =
    props.variant === undefined || props.variant === "default"
      ? {}
      : { "data-variant": props.variant };
  if (props.href !== undefined) {
    return (
      <a class="Button" href={props.href} {...variant}>
        {props.children}
      </a>
    );
  }
  return (
    <button type={props.type ?? "button"} class="Button" {...variant}>
      {props.children}
    </button>
  );
}
