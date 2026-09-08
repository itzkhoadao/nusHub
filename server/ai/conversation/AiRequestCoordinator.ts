export class AiConcurrencyLimitError extends Error {
  constructor() {
    super("An AI request is already running for this user");
    this.name = "AiConcurrencyLimitError";
  }
}

export class AiRequestCoordinator {
  private readonly activeByUser = new Map<string, number>();

  constructor(private readonly limitPerUser: number) {
    if (!Number.isInteger(limitPerUser) || limitPerUser < 1) {
      throw new Error("AI concurrency limit must be a positive integer");
    }
  }

  acquire(userId: string) {
    const active = this.activeByUser.get(userId) ?? 0;
    if (active >= this.limitPerUser) throw new AiConcurrencyLimitError();
    this.activeByUser.set(userId, active + 1);

    let released = false;
    return () => {
      if (released) return;
      released = true;
      const remaining = (this.activeByUser.get(userId) ?? 1) - 1;
      if (remaining <= 0) this.activeByUser.delete(userId);
      else this.activeByUser.set(userId, remaining);
    };
  }
}
