class AppError extends Error {
  public status: number;
  /** Extra payload returned to the client alongside the message. */
  public data?: unknown;

  constructor(message: string | unknown, status: number, data?: unknown) {
    if (message instanceof Error) {
      super(message.message);
    } else {
      super(message as string);
    }
    this.status = status;
    this.data = data;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export interface IValidationError {
  field: string;
  error: string;
}
export class ValidationError extends Error {
  constructor(message: IValidationError[]) {
    super(JSON.stringify(message));
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export default AppError;
