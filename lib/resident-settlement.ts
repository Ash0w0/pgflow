/**
 * Simplified business logic for resident move-out settlements and deposit deductions.
 * Net Refund = Security Deposit - Utility Deductions - Damage Charges - Unpaid Rent Deductions
 */

export interface MoveOutCalculationInput {
  depositAmount: number;
  utilityDeductions?: number;
  damageDeductions?: number;
  unpaidRentDeductions?: number;
}

export interface MoveOutCalculationResult {
  depositAmount: number;
  utilityDeductions: number;
  damageDeductions: number;
  unpaidRentDeductions: number;
  totalDeductions: number;
  netRefundAmount: number;
}

/**
 * Calculates simplified move-out settlement deductions and net deposit refund.
 */
export function calculateMoveOutSettlement(input: MoveOutCalculationInput): MoveOutCalculationResult {
  const deposit = Math.max(0, input.depositAmount || 0);
  const utility = Math.max(0, input.utilityDeductions || 0);
  const damage = Math.max(0, input.damageDeductions || 0);
  const unpaidRent = Math.max(0, input.unpaidRentDeductions || 0);

  const totalDeductions = Math.round((utility + damage + unpaidRent) * 100) / 100;
  const netRefundAmount = Math.round((deposit - totalDeductions) * 100) / 100;

  return {
    depositAmount: deposit,
    utilityDeductions: utility,
    damageDeductions: damage,
    unpaidRentDeductions: unpaidRent,
    totalDeductions,
    netRefundAmount,
  };
}
