export abstract class BaseService {
  abstract readonly name: string;

  abstract run(): Promise<void> | void;

  toString(): string {
    return this.name;
  }
}
