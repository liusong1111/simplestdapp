<template>
    <div id="app">
        <div id="appContent">
            <h1>Simplest dApp on CKB <a href="https://github.com/rebase-network/simplestdapp" target="_blank">(Source Code)</a> </h1>
            <p>The code is forked from <a href="https://github.com/liusong1111/simplestdapp" target="_blank">liusong1111/simplestdapp</a></p>
            <p>Please download latest version of <a href="https://github.com/rebase-network/synapse-extension/releases/" target="_blank">Synapse extension</a> before you use this dapp</p>
            <form>
                <fieldset>
                    <div class="row">
                        <label for="address">
                            Your testnet address:
                        </label>
                        <input id="address" disabled :value="address"/>
                        <button @click.prevent="reload">Get Info</button>
                    </div>
                    <div class="row">
                        <label for="balance">
                            Testnet balance:
                        </label>
                        <input id="balance" :value="formatCkb(summary.free)" disabled/> &nbsp;
                        <a href="https://faucet.nervos.org/" target="_blank">get more...</a>
                    </div>
                </fieldset>
            </form>
            <div class="cells">
                <h3>Data cell list
                    &nbsp;<button @click.prevent="newCell()">Create Cell</button>
                    &nbsp;<button @click.prevent="reload()">Refresh{{loading && "ing.." || ""}}</button>
                </h3>
                <div v-if="!filledCells" class="no-data">
                    No Data Cells
                </div>
                <div>
                    <div class="cell" v-for="cell in filledCells" :key="cell.outPoint.txHash + cell.outPoint.index">
                        <div class="cell-header">
                            Capacity: {{formatCkb(cell.capacity)}}
                            <div class="cell-ops">
                                <a href="#" @click.prevent="deleteCell(cell)">Delete</a>
                                &nbsp;&nbsp;<a href="#" @click.prevent="editCell(cell)">Update</a>
                            </div>
                        </div>
                        <div class="cell-body">
                            Data:
                            {{hexToText(cell.outputData)}}
                        </div>
                    </div>
                </div>
            </div>
            <div id="model" :class="{hidden: !this.showModel}">
                <div class="model-content">
                    <h3>Input Data Content</h3>
                    <div>
                        <textarea v-model="editData" placeholder="content in hex-string format"></textarea>
                    </div>
                    <div>
                        <button @click.prevent="cancelModel()">Cancel</button>
                        <button @click.prevent="submitModel()" style="float:right">Confirm</button>
                    </div>
                </div>
            </div>
        </div>
    </div>

</template>

<script>
    import * as BN from "bn.js";
    import {
        hexToBytes,
        // privateKeyToPublicKey,
        blake160,
        utf8ToBytes,
        bytesToHex,
        hexToUtf8,
    } from "@nervosnetwork/ckb-sdk-utils";

    import {createRawTx, updateDataRawTx, addressToScript, oneCkb} from "./utils.js";

    const secp256k1Dep = {
    outPoint: {
        txHash: '0xf8de3bb47d055cdf460d93a2a6e1b05f7432f9777c8c474abf4eec1d4aee5d37',
        index: '0x0',
    },
    depType: 'depGroup',
    };

    export default {
        name: 'App',
        data: function () {
            return {
                privateKey: "",
                publicKey: "",
                address: "",
                toLock: undefined,
                lockArg: undefined,
                cells: [],
                emptyCells: [],
                filledCells: [],
                summary: {
                    inuse: 0,
                    free: 0,
                    capacity: 0,
                },
                showModel: false,
                mode: undefined,
                editData: "",
                loading: false,
            }
        },
        components: {},
        methods: {
            reload: async function () {
                this.loading = true
                console.log('reload')
                const { data: addressInfo } = window.ckb && await window.ckb.getAddressInfo();
                if (!addressInfo) return;
                console.log('addressInfo: ', addressInfo)
                const { publicKey, capacity, address } = addressInfo
                this.publicKey = publicKey
                this.address = address
                this.summary = {
                    inuse: 0,
                    free: capacity,
                    capacity,
                }
                this.lockArg = `0x${blake160(this.publicKey, 'hex')}`
                this.toLock = {
                    // SECP256K1_BLAKE160_SIGHASH_ALL_TYPE_HASH, fixed
                    codeHash: "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8",
                    hashType: "type",
                    args: this.lockArg,
                }
                try {
                    this.cells = await this.getCells()
                } catch (e) {
                    console.log("error:" + e)
                    console.log(e)
                }
                this.loading = false
                // this.summary = this.getSummary(this.cells)
                console.log("summary:", this.summary)

                const {emptyCells, filledCells} = this.groupCells(this.cells)
                this.emptyCells = emptyCells
                this.filledCells = filledCells
            },
            formatCkb: function (c) {
                if (typeof (c) === "undefined") {
                    return undefined
                }
                let fraction = c % 100000000
                fraction = fraction.toString().padStart(8, "0")
                let integer = Math.floor(c / 100000000)
                const format = new Intl.NumberFormat({useGrouping: true})
                integer = format.format(integer)
                return integer + "." + fraction
            },
            cancelModel: function () {
                this.showModel = false
            },
            newCell: function () {
                this.showModel = true
                this.editData = ""
                this.mode = "create"
                this.currentCell = null;
            },
            editCell: function (cell) {
                this.showModel = true
                this.editData = ""
                this.mode = "update"
                this.currentCell = cell;
            },
            submitModel: function () {
                this.opCell()
            },
            deleteCell: async function(cell) {
                if (!confirm("Are you sure to delete this cell?")) {
                    return
                }

                this.editData = "0x"
                this.mode = "delete"
                this.currentCell = cell
                const fee = new BN(oneCkb * 0.0001)
                const oldCapacity = new BN(cell.capacity.slice(2), 16)
                const recallCapacity = oldCapacity.sub(fee)
                const inputCells = [this.currentCell]

                const rawTx = createRawTx(
                    addressToScript(this.address), // toLockScript
                    addressToScript(this.address), //fromLockScript
                    recallCapacity,
                    inputCells,
                    [secp256k1Dep],
                    fee, this.editData, // toDataHex
                );

                if (!window.ckb) return;
                const txResult = await window.ckb.signSend({
                    tx: rawTx
                })

                console.log('txResult: ', txResult)
                this.loading = false
                this.showModel = false
                this.reload()
            },
            getRawTxTemplate: function () {
                return {
                    version: "0x0",
                    cellDeps: [{
                        outPoint: {
                            // a fixed value for testnet
                            txHash: "0xf8de3bb47d055cdf460d93a2a6e1b05f7432f9777c8c474abf4eec1d4aee5d37",
                            index: "0x0"
                        },
                        depType: "depGroup",
                    }],
                    headerDeps: [],
                    inputs: [],
                    outputs: [],
                    witnesses: [],
                    outputsData: []
                }
            },
            textToHex: function (text) {
                let result = text.trim()
                if (result.startsWith("0x")) {
                    return result
                }
                const bytes = utf8ToBytes(result)
                result = bytesToHex(bytes)
                return result
            },
            hexToText: function (hex) {
                let result = hex.trim()
                try {
                    result = hexToUtf8(result)
                    let isAscii = true
                    for (let i = 0; i < result.length; i++) {
                        if (result.charCodeAt(i) > 255) {
                            isAscii = false
                            break
                        }
                    }
                    if (isAscii) {
                        return result
                    } else {
                        return hex.trim()
                    }
                } catch (e) {
                    console.log("hexToUtf8 error:", e, "fallback to hex")
                }
                return result
            },
            opCell: async function() {
                const editData = this.textToHex(this.editData)
                let bytes = hexToBytes(editData)
                let byteLength = bytes.byteLength

                const fee = new BN(oneCkb * 0.0001)
                // create cell
                if (this.mode === "create") {
                    let _capacity = new BN(byteLength * oneCkb)
                    const costCapacity = _capacity.add(new BN(61 * oneCkb))
                    const inputCells = this.emptyCells

                    const rawTx = createRawTx(
                        addressToScript(this.address), //fromLockScript
                        addressToScript(this.address), // toLockScript
                        costCapacity,
                        inputCells,
                        [secp256k1Dep],
                        fee,
                        editData, // toDataHex
                    )
                    console.log('rawTx: ', rawTx)

                    if (!window.ckb) return;
                    const txResult = await window.ckb.signSend({
                        tx: rawTx
                    })

                    console.log('txResult: ', txResult)
                }

                // update cell
                if (this.mode === "update") {
                    let newDataCapacity = new BN(byteLength * oneCkb)
                    const currCell = this.currentCell

                    // dataCellCapacity == cell.capcity
                    const _dataCellByteLength = hexToBytes(currCell.outputData).byteLength
                    const oldDataCapacity = new BN(_dataCellByteLength * oneCkb)

                    const upCellRawTx = updateDataRawTx(
                        addressToScript(this.address), // fromLockScript
                        currCell.outPoint, // inputOutPoint
                        oldDataCapacity,
                        newDataCapacity, // newDataCapacity
                        this.emptyCells, // unspentCells
                        [secp256k1Dep], // deps
                        fee, // fee
                        this.textToHex(this.editData), // newDataHex
                    )

                    if (!window.ckb) return;
                    console.log('upCellRawTx: ', upCellRawTx)

                    const txResult = await window.ckb.signSend({
                        tx: upCellRawTx
                    })
                    console.log('txResult: ', txResult)
                }

                this.loading = false
                this.showModel = false
                this.reload()
            },
            getCells: async function () {
                try {
                    let res = await window.ckb.getLiveCells({ limit: 50 })
                    console.log("get_cells response:", res)
                    return res.data
                } catch (e) {
                    console.log("error:", e)
                    console.log("error:" + e)
                }
                this.loading = false
            },
            groupCells: function (cells = []) {
                let emptyCells = [];
                let filledCells = [];
                const nonSudtCells = cells.filter(cell => !cell.typeHash);
                console.log('nonSudtCells: ', nonSudtCells)
                for (let cell of nonSudtCells) {
                    if (cell.outputData === "0x") {
                        emptyCells.push(cell)
                    } else {
                        filledCells.push(cell)
                    }
                }
                return {
                    emptyCells,
                    filledCells,
                }
            },
            getSummary: function (cells) {
                let capacity = 0
                let inuse = 0
                let free = 0
                for (let cell of cells) {
                    const _capacity = parseInt(cell.output.capacity)
                    capacity += _capacity

                    if (cell.outputData === "0x") {
                        free += _capacity
                    } else {
                        inuse += _capacity
                    }
                }
                return {
                    inuse,
                    capacity,
                    free,
                }
            },
        }
    }
</script>

<style>
    #app {
        font-family: Avenir, Helvetica, Arial, sans-serif;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        width: 100%;
    }

    #appContent {
        width: 800px;
        margin: auto;
    }

    h1, h3 {
        text-align: center;
    }

    fieldset {
        display: table;
    }

    .row {
        display: table-row;
    }

    label {
        display: table-cell;
        padding: 8px;
        text-align: right;
    }

    input {
        width: 35em;
    }

    .no-data {
        background-color: #f0f0f0;
        padding: 20px;
        text-align: center;
    }

    .cell {
        margin: 8px;
        padding: 8px;
        border: 1px solid #ccc;
        background-color: #f0f0f0;
    }

    .cell-header {
        padding: 8px;
    }

    .cell-ops {
        float: right;
    }

    .cell-body {
        background-color: #fff;
        padding: 8px;
    }

    .hidden {
        display: none;
    }

    #model {
        position: absolute;
        z-index: 2;
        left: 0;
        top: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(128, 128, 128, 0.2);
    }

    #model .model-content {
        position: relative;
        top: 300px;
        margin: auto;
        width: 50em;
        background-color: #ccc;
        padding: 0 20px 20px 20px;
        border: 1px solid #999;
    }

    #model textarea {
        width: 100%;
        height: 10em;
    }


</style>
