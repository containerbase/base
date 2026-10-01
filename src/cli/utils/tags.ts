import type { TemplateTransformer } from 'common-tags';
import {
  TemplateTag,
  stripIndentTransformer,
  trimResultTransformer,
} from 'common-tags';

const appendNewlineTransformer: TemplateTransformer = {
  onEndResult: (endResult) => `${endResult}\n`,
};

/**
 * Like `codeBlock` from common-tags, but ends with a newline.
 *
 * Every tag common-tags exports trims both ends of the result, which drops the
 * newline a text file should end with. Use this one when the content is written
 * to a file, and `codeBlock` when it is embedded into something else.
 *
 * `createTag` is only declared by the types, the installed common-tags does not
 * export it, so the tag is composed with `TemplateTag` directly.
 */
export const fileContent = new TemplateTag(
  stripIndentTransformer(),
  trimResultTransformer(),
  appendNewlineTransformer,
);
