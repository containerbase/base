import { Container } from 'inversify';
import { createContainer, rootContainerModule } from '../src/cli/services';

export async function testContainer() {
  const parent = new Container();
  await parent.load(rootContainerModule);
  return createContainer(parent);
}
