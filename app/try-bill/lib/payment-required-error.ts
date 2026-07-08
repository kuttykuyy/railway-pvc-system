export class PaymentRequiredError extends Error {
  requiredPayment: number;
  constructor(message: string, requiredPayment: number) {
    super(message);
    this.name = 'PaymentRequiredError';
    this.requiredPayment = requiredPayment;
  }
}
