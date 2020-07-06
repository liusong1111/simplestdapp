<template>
    <div id="app">
        <div id="appContent">
            <h1>Simplest dApp on CKB <a href="https://github.com/liusong1111/simplestdapp" target="_blank">(Source
                Code)</a></h1>
            <div class="row">
                <button @click.prevent="getAuth()">getAuth</button>
                &nbsp;&nbsp;&nbsp;&nbsp;
                <button @click.prevent="reload()">Reload{{loading && "ing.." || ""}}</button>
            </div>
            <form>
                <fieldset>
                    <div class="row">
                        <label for="address">
                            Your testnet address:
                        </label>
                        <select v-model="address" @change="reload()">
                            <option v-for="address in addresses" :value="address">{{address.address}}</option>
                        </select>
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
                    &nbsp;
                </h3>
                <div v-if="!filledCells" class="no-data">
                    No Data Cells
                </div>
                <div>
                    <div class="cell" v-for="cell in filledCells" :key="cell.created_by.block_number + cell.created_by.tx_hash + cell.created_by.index">
                        <div class="cell-header">
                            Capacity: {{formatCkb(cell.cell_output.capacity)}}
                            <div class="cell-ops">
                                <a href="#" @click.prevent="deleteCell(cell)">Delete</a>
                                &nbsp;&nbsp;<a href="#" @click.prevent="editCell(cell)">Update</a>
                            </div>
                        </div>
                        <div class="cell-body">
                            Data:
                            {{hexToText(cell.data.content)}}
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
        utf8ToBytes,
        bytesToHex,
        hexToUtf8,
    } from "@nervosnetwork/ckb-sdk-utils";
    import {KeyperingService} from "./services";

    export default {
        name: 'App',
        data: function () {
            return {
                addresses: [],
                address: "",
                toLock: undefined,
                lockArg: undefined,
                lockHash: undefined,
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
                service: null,
            }
        },
        components: {},
        async mounted() {
            this.service = new KeyperingService("ws://localhost:3012")
        },
        methods: {
            reload: async function () {
                let authToken;
                try {
                    authToken = window.localStorage.getItem("authToken")
                } catch(e) {
                    console.log("error:", e)
                }

                if (!authToken) {
                    console.log("no token")
                    return;
                }
                this.loading = true
                this.addresses = await this.service.queryAddresses({})
                if(!this.address && this.addresses.length > 0) {
                    this.address = this.addresses[0]
                }
                console.log("current address:", this.address)
                this.lockArg = this.address.meta.script.args
                this.lockHash = this.address.hash
                this.toLock = this.address.meta.script
                try {
                    this.cells = await this.service.queryLiveCells(this.lockHash)
                    console.log("cells:", this.cells)
                } catch (e) {
                    alert("error:" + e)
                    console.log(e)
                }
                this.loading = false
                this.summary = this.getSummary(this.cells)
                console.log("summary:", this.summary)
                const {emptyCells, filledCells} = this.groupCells(this.cells)
                this.emptyCells = emptyCells
                this.filledCells = filledCells
            },
            getAuth: async function () {
                const result = await this.service.requestAuth({
                    origin: window.location.origin,
                    description: "a simplest dApp"
                })
                console.log("getAuth result:" + result)
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
                this.editData = this.hexToText(cell.data.content)
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
                const rawTx = this.getRawTxTemplate()
                let total = new BN(0)

                if (this.mode === "create" || this.mode === "update") {
                    const editData = this.textToHex(this.editData)
                    let bytes = hexToBytes(editData)
                    let byteLength = bytes.byteLength
                    let capacity = new BN(byteLength * 100000000)
                    // State Rent
                    capacity = capacity.add(new BN("6100000000"))

                    // add Transaction Fee
                    // todo: calculate a good value
                    total = capacity.add(new BN("10000000"))

                    rawTx.outputs.push({
                        capacity: `0x${capacity.toString(16)}`,
                        lock: this.toLock,
                    })
                    rawTx.outputsData.push(editData)
                } else {
                    total = new BN("10000000")
                }

                let cells = this.emptyCells;
                let inputCapacity = new BN(0);
                let ok = false
                if (this.mode === "update" || this.mode === "delete") {
                    cells = [this.currentCell, ...cells]
                }
                for (let cell of cells) {
                    rawTx.inputs.push({
                        previousOutput: {
                            txHash: cell.created_by.tx_hash,
                            index: cell.created_by.index,
                        },
                        since: "0x0",
                    })
                    rawTx.witnesses.push("0x")
                    let cellCapacity = new BN(cell.cell_output.capacity.replace("0x", ""), 16)
                    inputCapacity = inputCapacity.add(cellCapacity)
                    if (inputCapacity.gt(total)) {
                        if (inputCapacity.sub(total).gt(new BN("6100000000"))) {
                            const change = inputCapacity.sub(total)
                            rawTx.outputs.push({
                                capacity: `0x${change.toString(16)}`,
                                lock: this.toLock,
                            })
                            rawTx.outputsData.push("0x")
                        }
                        ok = true
                        break
                    }
                }
                if (!ok) {
                    alert("You have not enough CKB!")
                    return
                }
                rawTx.witnesses[0] = {
                    lock: "",
                    inputType: "",
                    outputType: "",
                }
                //sign
                // const ckb = new CKB("https://prototype.ckbapp.dev/testnet/rpc")
                // const signedTx = ckb.signTransaction(`0x${this.privateKey}`)(rawTx)
                this.loading = true
                // const signedTx = await this.service.signTransaction(rawTx, "hello")
                // console.log("signedTx:", JSON.stringify(signedTx, null, "  "))
                // try {
                //     // await ckb.rpc.sendTransaction(signedTx)
                //     await this.service?.sendTransaction(signedTx)
                //     setTimeout(() => {
                //         alert("Tx has been broadcasted, please refresh later. Typical block interval is 8~30s")
                //     }, 0)
                // } catch (e) {
                //     console.log("sendTransaction error:", e)
                //     alert("error:", e)
                // }
                const signedTx = await this.service.signAndSendTransaction({tx: rawTx, meta: "hello", target: {lockHash: this.lockHash}})
                console.log("signedTx:", signedTx)
                alert("Tx has been broadcasted, please refresh later. Typical block interval is 8~30s")
                this.loading = false
                this.showModel = false
                setTimeout(() => {
                    this.reload()
                }, 1000)
            },
            groupCells: function (cells) {
                let emptyCells = [];
                let filledCells = [];
                for (let cell of cells) {
                    if (cell.output_data_len === "0x0") {
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
                let capacity = new BN(0)
                let inuse = new BN(0)
                let free = new BN(0)
                for (let cell of cells) {
                    const _capacity = new BN(cell.cell_output.capacity.replace("0x", ""), 16)
                    capacity.iadd(_capacity)

                    if (cell.output_data_len === "0x0") {
                        free.iadd(_capacity)
                    } else {
                        inuse.iadd(_capacity)
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
