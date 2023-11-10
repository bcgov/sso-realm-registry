import mustache from 'mustache';
import fs from 'fs';
import path from 'path';

const SEPARATOR = '\n';

export const generateCustomRealmTf = (realmName: string, tfModuleRef: string) => {
  const template = fs.readFileSync(path.resolve('./utils/tf-custom-realm-template.mustache'), 'utf8');

  const data = {
    customRealmName: realmName,
    tfModuleRef: tfModuleRef,
  };

  return (
    mustache
      .render(template, data)
      .split(SEPARATOR)
      .filter((v) => v.length > 0)
      .join(SEPARATOR) + SEPARATOR
  );
};
