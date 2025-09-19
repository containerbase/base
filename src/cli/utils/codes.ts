/**
 * Action not supported.
 */
export const NotSupported = 2;

/**
 * A missing version is blocking installation.
 */
export const MissingVersion = 15;

/**
 * A missing parent dependency blocks adding of child.
 */
export const MissingParent = 16;

/**
 * Can't uninstall because the version of the tool is currently linked.
 */
export const CurrentVersion = 17;

/**
 * A child dependency blocks removal of parent.
 */
export const BlockingChild = 18;
