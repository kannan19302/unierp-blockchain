#!/bin/bash
# =============================================================================
# UniERP Fabric Network Startup Script
# =============================================================================
# Generates crypto material, creates channels, and starts all Fabric services.
#
# Prerequisites:
#   - Docker and Docker Compose installed
#   - fabric-samples binaries in PATH (cryptogen, configtxgen)
#   - Run from: packages/blockchain/network/
#
# Usage:
#   bash scripts/start-network.sh
# =============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NETWORK_DIR="$(dirname "$SCRIPT_DIR")"

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║         UniERP Hyperledger Fabric Network Startup        ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# ─── Step 1: Generate crypto material ───────────────────────────────────────
echo "▶ Step 1: Generating crypto material (certificates, keys)..."

if [ -d "$NETWORK_DIR/crypto-config" ]; then
    echo "  Crypto material already exists — skipping generation."
    echo "  To regenerate, run: rm -rf $NETWORK_DIR/crypto-config && bash scripts/start-network.sh"
else
    cryptogen generate --config="$NETWORK_DIR/crypto-config.yaml" --output="$NETWORK_DIR/crypto-config"
    echo "  ✅ Crypto material generated in $NETWORK_DIR/crypto-config"
fi

# ─── Step 2: Generate genesis block and channel artifacts ───────────────────
echo ""
echo "▶ Step 2: Generating channel artifacts..."
mkdir -p "$NETWORK_DIR/channel-artifacts"

# System channel genesis block (for orderer bootstrap)
configtxgen \
    -profile UnerpOrdererGenesis \
    -channelID system-channel \
    -outputBlock "$NETWORK_DIR/channel-artifacts/genesis.block" \
    -configPath "$NETWORK_DIR"

# Main UniERP channel transaction
configtxgen \
    -profile UnerpMainChannel \
    -outputCreateChannelTx "$NETWORK_DIR/channel-artifacts/unerp-channel.tx" \
    -channelID unerp-channel \
    -configPath "$NETWORK_DIR"

# Supply chain channel transaction
configtxgen \
    -profile UnerpSupplyChainChannel \
    -outputCreateChannelTx "$NETWORK_DIR/channel-artifacts/supplychain-channel.tx" \
    -channelID supplychain-channel \
    -configPath "$NETWORK_DIR"

# Procurement channel transaction
configtxgen \
    -profile UnerpProcurementChannel \
    -outputCreateChannelTx "$NETWORK_DIR/channel-artifacts/procurement-channel.tx" \
    -channelID procurement-channel \
    -configPath "$NETWORK_DIR"

echo "  ✅ Channel artifacts generated"

# ─── Step 3: Start Docker services ──────────────────────────────────────────
echo ""
echo "▶ Step 3: Starting Fabric Docker services..."
cd "$NETWORK_DIR"
docker compose -f docker-compose.fabric.yml up -d

echo "  ⏳ Waiting for services to be healthy (30s)..."
sleep 30

# ─── Step 4: Create channels ────────────────────────────────────────────────
echo ""
echo "▶ Step 4: Creating channels..."
bash "$SCRIPT_DIR/create-channel.sh"

# ─── Step 5: Deploy chaincodes ──────────────────────────────────────────────
echo ""
echo "▶ Step 5: Deploying chaincodes..."
bash "$SCRIPT_DIR/deploy-chaincode.sh"

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║              🚀 Fabric Network is Ready!                  ║"
echo "║                                                           ║"
echo "║  Peer:       localhost:7051                               ║"
echo "║  CA:         localhost:7054                               ║"
echo "║  CouchDB:    http://localhost:5984/_utils                 ║"
echo "║  Explorer:   http://localhost:8090                        ║"
echo "║                                                           ║"
echo "║  Channels:   unerp-channel                               ║"
echo "║               supplychain-channel                         ║"
echo "║               procurement-channel                         ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
