import PWCore, {
  Builder,
  Amount,
  AmountUnit,
  Transaction,
  RawTransaction,
  Cell,
} from '@lay2/pw-core';
export default class SDBuilder extends Builder {
  constructor(inputCell, outputCell) {
    super();
    this.inputCell = inputCell;
    this.outputCell = outputCell;
  }

  async build() {
    let inputCells = [];
    let inputSum;
    if (this.inputCell) {
      inputCells.push(this.inputCell);
    }

    let neededAmount;

    if (!this.inputCell) {
      neededAmount = Amount.ADD(this.outputCell.capacity, Builder.MIN_CHANGE);
    } else if (this.outputCell) {
      if (Amount.LTE(this.inputCell.capacity, this.outputCell.capacity)) {
        // new cell is bigger than the old one
        neededAmount = Amount.SUB(
          this.outputCell.capacity,
          this.inputCell.capacity
        );
        neededAmount = Amount.ADD(neededAmount, Builder.MIN_CHANGE);
      }
    }

    let changeCell = this.inputCell;

    if (neededAmount) {
      console.log('[sd-builder] neededAmount ', neededAmount.toString(AmountUnit.ckb))
      const cells = await this.collector.collect(
        PWCore.provider.address,
        neededAmount,
        { withData: false }
      );

      let sum = new Amount('0');
      for (const cell of cells) {
        inputCells.push(cell);
        sum = Amount.ADD(sum, cell.capacity);
        if (Amount.GT(sum, neededAmount)) break;
      }
      console.log('[sd-builder] inputSum 2', sum.toString(AmountUnit.ckb))

      if (Amount.LT(sum, neededAmount)) {
        throw new Error(
          `[1] input capacity not enough, need ${neededAmount.toString(
            AmountUnit.ckb
          )}, got ${sum.toString(AmountUnit.ckb)}`
        );
      }

      inputSum = this.inputCell ? Amount.ADD(sum, this.inputCell.capacity) : sum;

      changeCell = new Cell(
        Amount.SUB(inputSum, this.outputCell.capacity),
        PWCore.provider.address.toLockScript()
      );
    }

    const outputCells = [changeCell];
    if (this.outputCell) outputCells.unshift(this.outputCell);

    const tx = new Transaction(new RawTransaction(inputCells, outputCells));

    this.fee = Builder.calcFee(tx);

    if (
      Amount.GT(Amount.ADD(this.fee, Builder.MIN_CHANGE), changeCell.capacity)
    ) {
      // TODO: collect more cells and recalculate fee, until input capacity is
      // enough or no more available unspent cells.
      throw new Error(
        `[2] input capacity not enough, need ${Amount.ADD(
          this.outputCell.capacity,
          this.fee
        ).toString(AmountUnit.ckb)}, got ${inputSum.toString(AmountUnit.ckb)}`
      );
    }

    // sub fee from changeCell
    changeCell.capacity = Amount.SUB(changeCell.capacity, this.fee);
    tx.raw.outputs.pop();
    tx.raw.outputs.push(changeCell);

    console.log("[sd-builder] tx: ", tx);

    return tx;
  }
}
