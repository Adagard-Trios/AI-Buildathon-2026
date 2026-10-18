#!/bin/sh
# Start the audit chain, deploy the registry contract, then the API.
# Deliberately no `set -e`: a chain that fails to start must not stop the API from serving.

cd /app/blockchain
npx hardhat node --hostname 127.0.0.1 --port 8545 > /tmp/chain.log 2>&1 &

rpc_up() {
  node -e "fetch('http://127.0.0.1:8545',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_chainId',params:[]})}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
}

tries=0
until rpc_up; do
  tries=$((tries + 1))
  if [ "$tries" -ge 60 ]; then
    echo "[audit-start] chain did not come up in 60s; continuing without it" >&2
    tail -20 /tmp/chain.log >&2
    break
  fi
  sleep 1
done

if rpc_up; then
  # Writes /app/backend/src/config/contractConfig.json, which BlockchainService reads.
  npx hardhat run scripts/deploy.js --network localhost \
    || echo "[audit-start] contract deploy failed; the API will use its fallback ledger" >&2
fi

cd /app/backend
exec node src/index.js
