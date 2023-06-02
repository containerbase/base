import { execa } from 'execa';
import { inject, injectable } from 'inversify';
import { PrepareToolBaseService } from '../../prepare-tool/prepare-tool-base.service';
import { EnvService } from '../../services';

@injectable()
export class PrepareDockerService extends PrepareToolBaseService {
  readonly name = 'docker';

  constructor(@inject(EnvService) private envSvc: EnvService) {
    super();
  }

  async execute(): Promise<void> {
    await execa('groupadd', ['-g', '999', 'docker']);
    await execa('usermod', ['-aG', 'docker', this.envSvc.userName]);
  }
}
