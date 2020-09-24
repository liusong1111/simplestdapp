<template>
  <div id="app">
    <div id="appContent">
      <h1>
        Simplest dApp on CKB
        <a href="https://github.com/lay2dev/simplestdapp" target="_blank">
          (Source Code)
        </a>
      </h1>
      <center>
        <h4>
          Forked from
          <a href="https://github.com/liusong1111/simplestdapp" target="_blank"
            >liusong's work</a
          >
          with
          <a href="https://www.npmjs.com/package/@lay2/pw-core" target="_blank"
            >pw-core</a
          >
          adopted
        </h4>
      </center>

      <button v-if="!address" @click.prevent="connect()">wallet connect</button>
      <button v-if="address" @click.prevent="disconnect()">disconnect</button>

      <form>
        <fieldset>
          <div class="row">
            <label for="address">Your testnet address:</label>
            <input id="address" disabled :value="address" />
          </div>
          <div class="row">
            <label for="balance">Capacity:</label>
            <input
              id="balance"
              :value="
                `free: ${formatCkb(summary.free)} | used: ${formatCkb(
                  summary.inuse
                )} | total: ${formatCkb(summary.capacity)}`
              "
              disabled
            />
            &nbsp;
          </div>
        </fieldset>
      </form>
      <div class="cells">
        <h3>
          Data cell list &nbsp;
          <button @click.prevent="newCell()">Create Cell</button>
          &nbsp;
          <button @click.prevent="reload()">
            Refresh{{ (loading && "ing..") || "" }}
          </button>
        </h3>
        <div v-if="!filledCells" class="no-data">No Data Cells</div>
        <div>
          <div
            class="cell"
            v-for="cell in filledCells"
            :key="cell.outPoint.txHash + cell.outPoint.index"
          >
            <div class="cell-header">
              Capacity: {{ formatCkb(cell.capacity) }}
              <div class="cell-ops">
                <a href="#" @click.prevent="deleteCell(cell)">Delete</a>
                &nbsp;&nbsp;
                <a href="#" @click.prevent="editCell(cell)">Update</a>
              </div>
            </div>
            <div class="cell-body">Data: {{ cell.getData() }}</div>
          </div>
        </div>
      </div>
      <div id="model" :class="{ hidden: !this.showModel }">
        <div class="model-content">
          <h3>Input Data Content</h3>
          <div>
            <textarea
              v-model="editData"
              placeholder="both ascii-string and hex-string are supported"
            ></textarea>
          </div>
          <div>
            <button @click.prevent="closeModal()">Cancel</button>
            <button @click.prevent="opCell()" style="float:right">
              Confirm
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import PWCore, {
  Web3ModalProvider,
  Amount,
  AmountUnit,
  Cell,
  // EthSigner,
} from "@lay2/pw-core";
import SDCollector from "./sd-collector";
import SDBuilder from "./sd-builder";
import Web3Modal from "web3modal";
import WalletConnectProvider from "@walletconnect/web3-provider";
import supportedChains from "./chains";

export default {
  name: "App",
  data: function() {
    return {
      pw: {},
      web3Modal: null,
      chainId: 1,
      builder: {},
      address: "",
      cells: [],
      emptyCells: [],
      filledCells: [],
      summary: {
        inuse: new Amount("0"),
        free: new Amount("0"),
        capacity: new Amount("0"),
      },
      showModel: false,
      mode: undefined,
      editData: "",
      loading: false,
    };
  },
  components: {},
  async mounted() {
    this.web3Modal = new Web3Modal({
      network: this.getNetwork(),
      cacheProvider: true,
      providerOptions: this.getProviderOptions(),
    });

    if (this.web3Modal.cachedProvider) {
      this.connect();
    }
  },
  methods: {
    reload: async function() {
      this.loading = true;
      this.summary = await this.getSummary();
      this.loading = false;
    },
    formatCkb: function(c) {
      return c ? c.toString(AmountUnit.ckb, { commify: true }) + " CKB" : "-";
    },
    getNetwork: function() {
      return this.getChainData(this.chainId).network;
    },
    getChainData: function(chainId) {
      const chainData = supportedChains.filter(
        (chain) => chain.chain_id === chainId
      )[0];

      if (!chainData) {
        throw new Error("ChainId missing or not supported");
      }
      // const API_KEY = process.env.REACT_APP_INFURA_ID;
      const API_KEY = "89a648e271d54224ba4827d348cbaa54";
      if (
        chainData.rpc_url.includes("infura.io") &&
        chainData.rpc_url.includes("%API_KEY%") &&
        API_KEY
      ) {
        const rpcUrl = chainData.rpc_url.replace("%API_KEY%", API_KEY);
        return {
          ...chainData,
          rpc_url: rpcUrl,
        };
      }

      return chainData;
    },

    getProviderOptions: function() {
      const providerOptions = {
        walletconnect: {
          package: WalletConnectProvider,
          options: {
            // infuraId: process.env.REACT_APP_INFURA_ID
            infuraId: "89a648e271d54224ba4827d348cbaa54",
          },
        },
      };
      return providerOptions;
    },
    connect: async function() {
      const provider = await this.web3Modal.connect();
      this.pw = await new PWCore("https://aggron.ckb.dev").init(
        new Web3ModalProvider(provider),
        new SDCollector()
      );

      this.address = PWCore.provider.address.toCKBAddress();
      console.log("ETH address", PWCore.provider.address.addressString);

      this.reload();
    },
    disconnect: async function() {
      await PWCore.provider.close();
      await this.web3Modal.clearCachedProvider();

      this.pw = {};
      // web3Modal: null,
      (this.chainId = 1), (this.builder = {});
      this.address = "";
      this.cells = [];
      this.emptyCells = [];
      this.filledCells = [];
      this.summary = {
        inuse: new Amount("0"),
        free: new Amount("0"),
        capacity: new Amount("0"),
      };
      this.showModel = false;
      this.mode = undefined;
      (this.editData = ""), (this.loading = false);
    },
    newCell: function() {
      this.showModel = true;
      this.editData = "";
      this.mode = "create";
      this.currentCell = null;
    },
    editCell: function(cell) {
      this.showModel = true;
      this.editData = cell.getData();
      this.mode = "update";
      this.currentCell = cell;
    },
    deleteCell: function(cell) {
      if (!confirm("Are you sure to delete this cell?")) {
        return;
      }
      this.editData = "";
      this.mode = "delete";
      this.currentCell = cell;
      this.opCell();
    },
    closeModal: function() {
      this.showModel = false;
    },
    opCell: async function() {
      let inputCell, outputCell;

      if (this.mode === "delete" || this.mode === "update") {
        inputCell = this.currentCell;
        inputCell.setHexData("0x");
      }

      if (this.mode === "create" || this.mode === "update") {
        outputCell = new Cell(
          new Amount("100"),
          PWCore.provider.address.toLockScript()
        );
        if (this.editData.startsWith("0x")) {
          outputCell.setHexData(this.editData);
        } else {
          outputCell.setData(this.editData);
        }
        outputCell.resize();
      }

      try {
        this.loading = true;
        const builder = new SDBuilder(inputCell, outputCell);
        // const signer = new EthSigner(PWCore.provider.address.addressString);
        // const txHash = await this.pw.sendTransaction(builder, signer);
        const txHash = await this.pw.sendTransaction(builder);
        confirm(
          "tx sent: https://explorer.nervos.org/aggron/transaction/" + txHash
        );
      } catch (e) {
        this.loading = false;
        alert(e.toString());
        console.trace(e.toString());
        return;
      }
      this.loading = false;
      this.showModel = false;
    },

    getSummary: async function() {
      const capacity = await PWCore.defaultCollector.getBalance(
        PWCore.provider.address
      );
      this.filledCells = await PWCore.defaultCollector.collect(
        PWCore.provider.address,
        { withData: true }
      );
      this.emptyCells = await PWCore.defaultCollector.collect(
        PWCore.provider.address,
        { withData: false }
      );

      const inuse = this.filledCells.length
        ? this.filledCells
            .map((c) => c.capacity)
            .reduce((sum, cap) => sum.add(cap))
        : Amount.ZERO;
      const free = this.emptyCells.length
        ? this.emptyCells
            .map((c) => c.capacity)
            .reduce((sum, cap) => sum.add(cap))
        : Amount.ZERO;

      return {
        capacity,
        inuse,
        free,
      };
    },
  },
};
</script>

<style>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  width: 100%;
}

#appContent {
  width: 1000px;
  margin: auto;
}

h1,
h3 {
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
  width: 50em;
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
