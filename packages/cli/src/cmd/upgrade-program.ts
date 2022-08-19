import { Buffer } from 'buffer'
import type { Address } from '@project-serum/anchor'
import { web3 } from '@project-serum/anchor'
import log from 'loglevel'
import type { CmdContext } from './index'

export const BPF_UPGRADE_LOADER_ID = new web3.PublicKey(
  'BPFLoaderUpgradeab1e11111111111111111111111',
)

interface Context extends CmdContext {
  opts: {
    index: number
    multisig: Address
    programId: web3.PublicKey
    bufferAddr: web3.PublicKey
  }
}

export async function upgradeProgramCmd({ provider, client, opts }: Context) {
  const { programId, bufferAddr } = opts

  const programAccount = await provider.connection.getAccountInfo(new web3.PublicKey(programId))
  if (programAccount === null) {
    throw new Error('Unknown program')
  }

  const spillAddr = client.wallet.publicKey
  const programDataAddr = new web3.PublicKey(programAccount.data.slice(4))
  const [multisigKey] = await client.pda.multisig(opts.multisig)
  const [authority] = await client.pda.signer(multisigKey)

  const keys = [
    { pubkey: authority, isWritable: true, isSigner: true },
    { pubkey: programId, isWritable: true, isSigner: false },
    { pubkey: programDataAddr, isWritable: true, isSigner: false },
    { pubkey: bufferAddr, isWritable: true, isSigner: false },
    { pubkey: spillAddr, isWritable: false, isSigner: false },
    { pubkey: web3.SYSVAR_RENT_PUBKEY, isWritable: false, isSigner: false },
    { pubkey: web3.SYSVAR_CLOCK_PUBKEY, isWritable: false, isSigner: false },
  ] as any

  const instructions = [new web3.TransactionInstruction({
    programId: BPF_UPGRADE_LOADER_ID,
    keys,
    data: Buffer.from([3, 0, 0, 0]),
  })]

  const { transaction, key } = await client.createTransaction({
    multisig: multisigKey,
    instructions,
    index: opts.index ?? null,
  })

  try {
    const sig = await provider.sendAndConfirm(transaction)
    log.info(`Tx: ${key.toBase58()}`)
    log.info(`Signature: ${sig}`)
    log.info('OK')
  } catch (e) {
    log.info('Error')
    console.log(e)
  }
}
