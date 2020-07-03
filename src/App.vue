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
        // pubkeyToAddress,
        blake160,
        utf8ToBytes,
        bytesToHex,
        hexToUtf8,
    } from "@nervosnetwork/ckb-sdk-utils";
    // import CKB from "@nervosnetwork/ckb-sdk-core";

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
                const { publicKey, address, capacity } = addressInfo
                this.publicKey = publicKey
                this.address = address
                this.summary = {
                    inuse: 0,
                    free: capacity,
                    capacity,
                }
                this.lockArg = `0x${blake160(this.publicKey, 'hex')}`
                console.log('this.lockArg: ', this.lockArg)
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
                this.editData = this.hexToText(cell.outputData)
                this.mode = "update"
                this.currentCell = cell;
            },
            submitModel: function () {
                this.opCell()
            },
            deleteCell: function (cell) {
                if (!confirm("Are you sure to delete this cell?")) {
                    return
                }
                this.editData = ""
                this.mode = "delete"
                this.currentCell = cell
                this.opCell()
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
            opCell: async function () {

                const editData = this.textToHex(this.editData)
                let bytes = hexToBytes(editData)
                let byteLength = bytes.byteLength
                let capacity = new BN(byteLength)
                // State Rent
                capacity = capacity.add(new BN("61"))
                const txRequestObj = {
                    from: this.address,
                    to: this.address,
                    capacity: capacity.toString(),
                    data: editData
                }
                if (!window.ckb) return;
                const txResult = await window.ckb.send({
                    meta: txRequestObj
                })
                console.log('txResult: ', txResult)

                this.loading = false
                this.showModel = false
                this.reload()
            },
            getCells: async function() {
                this.loading = true
                try {
                    const liveCells = await window.ckb.getLiveCells({limit: '10', hasData: 'true'})

                    if (liveCells.success) {
                        const cells = liveCells.data

                        return cells
                    } else {
                        console.error('getLiveCells error')
                        console.error(liveCells.message)
                    }
                } catch (e) {
                    console.error("error:", e)
                    console.error("error:" + e)
                }
                this.loading = false
            },
            groupCells: function (cells) {
                let emptyCells = [];
                let filledCells = [];
                for (let cell of cells) {
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
