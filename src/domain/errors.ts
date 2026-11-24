/** Thrown when a command would leave the model in a state that breaks its invariants. */
export class DomainError extends Error {
  constructor(
    message: string,
    readonly problems: readonly string[] = [message],
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
