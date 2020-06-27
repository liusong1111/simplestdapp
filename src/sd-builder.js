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
      neededAmount = this.outputCell.capacity.add(Builder.MIN_CHANGE);
    } else if (this.outputCell) {
      if (this.inputCell.capacity.lte(this.outputCell.capacity)) {
        // new cell is bigger than the old one
        neededAmount = this.outputCell.capacity.sub(this.inputCell.capacity);
        neededAmount = neededAmount.add(Builder.MIN_CHANGE);
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
        sum = sum.add(cell.capacity);
        if (sum.gt(neededAmount)) break;
      }
      console.log('[sd-builder] inputSum 2', sum.toString(AmountUnit.ckb))

      if (sum.lt(neededAmount)) {
        throw new Error(
          `[1] input capacity not enough, need ${neededAmount.toString(
            AmountUnit.ckb
          )}, got ${sum.toString(AmountUnit.ckb)}`
        );
      }

      inputSum = this.inputCell ? sum.add(this.inputCell.capacity) : sum;

      changeCell = new Cell(
        inputSum.sub(this.outputCell.capacity),
        PWCore.provider.address.toLockScript()
      );
    }

    const outputCells = [changeCell];
    if (this.outputCell) outputCells.unshift(this.outputCell);

    const tx = new Transaction(new RawTransaction(inputCells, outputCells), [Builder.WITNESS_ARGS.Secp256k1]);

    this.fee = Builder.calcFee(tx);

    if (
      this.fee.add(Builder.MIN_CHANGE).gt(changeCell.capacity)
    ) {
      // TODO: collect more cells and recalculate fee, until input capacity is
      // enough or no more available unspent cells.
      throw new Error(
        `[2] input capacity not enough, need ${this.outputCell.capacity.add(this.fee).toString(AmountUnit.ckb)}, got ${inputSum.toString(AmountUnit.ckb)}`
      );
    }

    // sub fee from changeCell
    changeCell.capacity = changeCell.capacity.sub(this.fee);
    tx.raw.outputs.pop();
    tx.raw.outputs.push(changeCell);

    console.log("[sd-builder] tx: ", tx);

    return tx;
  }
}
