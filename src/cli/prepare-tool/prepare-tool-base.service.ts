import { injectable } from 'inversify';

@injectable()
export abstract class PrepareToolBaseService {
  abstract readonly name: string;

  abstract execute(): Promise<void> | void;

  toString(): string {
    return this.name;
  }
}
