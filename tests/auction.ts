import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { SimpleAuction } from "../target/types/simple_auction";
import { LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import { expect as chaiExpect, use } from "chai";
// import chai from 'chai';
import chaiAsPromised from "chai-as-promised";
import { before } from "mocha";

const expect = chaiExpect;
chai.use(chaiAsPromised);
// const expect = chai.expect;

const AMOUNT = 100 * LAMPORTS_PER_SOL;

describe("Auction", () => {
  let winnerBidInfo, userBidInfo, initializerBidInfo, nonPartBidInfo;
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.Provider.env());

  const provider = anchor.getProvider();

  const program = anchor.workspace.Auction as anchor.Program<SimpleAuction>;

  const state = anchor.web3.Keypair.generate();
  const treasury = anchor.web3.Keypair.generate();

  const WINNING_AMOUNT = 50 * LAMPORTS_PER_SOL;
  const INITIALIZER_AMOUNT = LAMPORTS_PER_SOL;
  const USER_AMOUNT = 2 * LAMPORTS_PER_SOL;

  const winner = anchor.web3.Keypair.generate();
  const user = anchor.web3.Keypair.generate();
  const nonParticipatingUser = anchor.web3.Keypair.generate();

  const airdrop = async (
    user: anchor.web3.Keypair,
    amount = AMOUNT,
    skipValidation = false
  ) => {
    const signature = await provider.connection.requestAirdrop(
      user.publicKey,
      amount
    );
    if (skipValidation) {
      await validateBalance(user, amount, true);
    }
  };

  const getBalance = (user: anchor.web3.Keypair) =>
    provider.connection.getBalance(user.publicKey);

  const validateBalance = async (
    user: anchor.web3.Keypair,
    amount: number,
    exact = false
  ) => {
    const balance = await getBalance(user);
    if (exact) {
      return expect(balance).to.eq(amount);
    }
    expect(balance).to.greaterThanOrEqual(amount - LAMPORTS_PER_SOL);
    expect(balance).to.lessThanOrEqual(amount);
  };

  const getBidInfoPda = async (user: anchor.web3.Keypair) => {
    const [pda] = await PublicKey.findProgramAddress(
      [anchor.utils.bytes.utf8.encode("bid-info"), user.publicKey.toBuffer()],
      program.programId
    );
    return pda;
  };

  before(() =>
    Promise.all([
      airdrop(winner),
      airdrop(nonParticipatingUser),
      getBidInfoPda(winner).then((pda) => (winnerBidInfo = pda)),
      getBidInfoPda(user).then((pda) => (userBidInfo = pda)),
      getBidInfoPda(nonParticipatingUser).then((pda) => (nonPartBidInfo = pda)),
    ])
  );

  describe("Initialization of Simple Auction", () => {
    it("Cannot initialize with old auction date!", () =>
      await expect(
        program.rpc.initialize(
          new anchor.BN(new Date("2020-01-01").getTime() / 1000),
          {
            accounts: {
              systemProgram: SystemProgram.programId,
              treasury: treasury.publicKey,
              state: state.publicKey,
              initializer: provider.wallet.publicKey,
            },

            signers: [state],
          }
        )
      ).to.be.rejectedWith(/Simple Auction is Inactive/));

    it("Simple Auction Is Initialized!", async () => {
      const tx = await program.rpc.initialize(
        new anchor.BN(new Date().getTime() / 1000 + 2),
        {
          accounts: {
            systemProgram: SystemProgram.programId,
            treasury: treasury.publicKey,
            state: state.publicKey,
            initializer: provider.wallet.publicKey,
          },
          signers: [state],
        }
      );

      expect(tx).not.to.be.empty;
    });

    // it("Is initialized!", async () => {
    //   // Add your test here.
    //   const tx = await program.rpc.initialize({});
    //   console.log("Your transaction signature", tx);
    // });

    it("Cannot be initialized twice!", () =>
      expect(
        program.rpc.initialize(new anchor.BN(new Date().getTime() / 1000), {
          accounts: {
            systemProgram: SystemProgram.programId,
            treasury: treasury.publicKey,
            state: state.publicKey,
            initializer: provider.wallet.publicKey,
          },
          signers: [state],
        })
      ).to.be.rejected);
  });

  describe("Auction starts", () => {
    it("User can bid!", async () => {
      const tx = await program.rpc.bid(new anchor.BN(WINNING_AMOUNT), {
        accounts: {
          systemProgram: SystemProgram.programId,
          state: state.publicKey,
          bidder: winner.publicKey,
          treasury: treasury.publicKey,
          bidInfo: winnerBidInfo,
        },
        signers: [winner],
      });

      expect(tx).not.to.be.empty;
      await Promise.all([
        validateBalance(winner, AMOUNT - WINNING_AMOUNT),
        validateBalance(treasury, WINNING_AMOUNT, true),
      ]);
    });

    it("Cannot bid with bad treasury!", () => {
      const myTreasury = anchor.web3.Keypair.generate();
      return expect(
        program.rpc.bid(new anchor.BN(LAMPORTS_PER_SOL), {
          accounts: {
            systemProgram: SystemProgram.programId,
            state: state.publicKey,
            bidder: user.publicKey,
            treasury: myTreasury.publicKey,
            bidInfo: userBidInfo,
          },
          signers: [user],
        })
      ).to.be.rejected;
    });

    it("Initializer can bid!", async () => {
      initializerBidInfo = await getBidInfoPda(provider.wallet as any);
      const tx = await program.rpc.bid(new anchor.BN(INITIALIZER_AMOUNT), {
        accounts: {
          state: state.publicKey,
          bidder: provider.wallet.publicKey,
          treasury: treasury.publicKey,
          bidInfo: initializerBidInfo,
          systemProgram: SystemProgram.programId,
        },
      });

      expect(tx).not.to.be.empty;
    });

    it("User cannot bid if they have insufficient fund!", () =>
      expect(
        program.rpc.bid(new anchor.BN(USER_AMOUNT), {
          accounts: {
            state: state.publicKey,
            treasury: treasury.publicKey,
            bidder: user.publicKey,
            bidInfo: userBidInfo,
            systemProgram: SystemProgram.programId,
          },

          signers: [user],
        })
      ).to.be.rejected);
  });

  it("User can bid but not twice!", async () => {
    await airdrop(user);
    const tx = await program.rpc.bid(new anchor.BN(USER_AMOUNT), {
      accounts: {
        state: state.publicKey,
        bidder: user.publicKey,
        bidInfo: userBidInfo,
        systemProgram: SystemProgram.programId,
        treasury: treasury.publicKey,
      },
      signers: [user],
    });

    expect(tx).not.to.be.empty;
    await validateBalance(user, AMOUNT - USER_AMOUNT);
    return expect(
      program.rpc.bid(new anchor.BN(USER_AMOUNT), {
        accounts: {
          state: state.publicKey,
          bidder: user.publicKey,
          bidInfo: userBidInfo,
          systemProgram: SystemProgram.programId,
          treasury: treasury.publicKey,
        },
        signers: [user],
      })
    ).to.be.rejected;
  });

  it("User cannot refund before the end!", () =>
    expect(
      program.rpc.refund({
        accounts: {
          systemProgram: SystemProgram.programId,
          treasury: treasury.publicKey,
          state: state.publicKey,
          bidder: user.publicKey,
          bidInfo: userBidInfo,
        },

        signers: [user, treasury],
      })
    ).to.be.rejectedWith(/Auction is active/));

  it("Initializer cannot receive money before the end of auction", async () =>
    await expect(
      program.rpc.endAuction({
        accounts: {
          state: state.publicKey,
          treasury: treasury.publicKey,
          initializer: provider.wallet.publicKey,
          systemProgram: SystemProgram.programId,
        },
        signers: [treasury],
      })
    ).to.be.rejectedWith(/Auction is active/));

  it("Cannot bid when auction is over!", async () => {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    return await expect(
      program.rpc.bid(new anchor.BN(LAMPORTS_PER_SOL), {
        accounts: {
          systemProgram: SystemProgram.programId,
          state: state.publicKey,
          bidder: nonParticipatingUser.publicKey,
          treasury: treasury.publicKey,
          bidInfo: nonPartBidInfo,
        },
        signers: [nonParticipatingUser],
      })
    ).to.be.rejectedWith(/Auction is inactive/);
    // });

    it("Treasury should be full of money", () =>
      validateBalance(
        treasury,
        WINNING_AMOUNT + INITIALIZER_AMOUNT + USER_AMOUNT,
        true
      ));
  });

  describe("The simple auction ends", () => {
    before(() => new Promise((resolve) => setTimeout(resolve, 1000)));

    it("Users cannot end the auction", () =>
      expect(
        program.rpc.endAuction({
          accounts: {
            systemProgram: SystemProgram.programId,
            treasury: treasury.publicKey,
            state: state.publicKey,

            initializer: user.publicKey,
          },
          signers: [user, treasury],
        })
      ).to.be.rejected);

    it("Cannot refund before the seller receive money!", () =>
      expect(
        program.rpc.refund({
          accounts: {
            systemProgram: SystemProgram.programId,
            treasury: treasury.publicKey,
            state: state.publicKey,
            bidder: user.publicKey,
            bidInfo: userBidInfo,
          },
          signers: [user, treasury],
        })
      ).to.be.rejectedWith(/Auction has not ended yet/));

    it("Initializer can receive money but not twice!", async () => {
      const balance = await getBalance(provider.wallet as any);
      const treasuryBalance = await getBalance(treasury);
      const tx = await program.rpc.endAuction({
        accounts: {
          state: state.publicKey,
          treasury: treasury.publicKey,
          initializer: provider.wallet.publicKey,
          systemProgram: SystemProgram.programId,
        },

        signers: [treasury],
      });

      expect(tx).not.to.be.empty;
      const updatedBalance = await getBalance(provider.wallet as any);
      const updatedTreasuryBalance = await getBalance(treasury);
      expect(balance).to.be.lessThan(updatedBalance);
      expect(balance).to.be.greaterThanOrEqual(
        updatedBalance - WINNING_AMOUNT - LAMPORTS_PER_SOL
      );
      expect(treasuryBalance).to.be.eq(updatedTreasuryBalance + WINNING_AMOUNT);

      return expect(
        program.rpc.endAuction({
          accounts: {
            systemProgram: SystemProgram.programId,
            treasury: treasury.publicKey,
            initializer: provider.wallet.publicKey,
            state: state.publicKey,
          },
          signers: [treasury],
        })
      ).to.be.rejectedWith(/Auction already ended/);
    });
  });

  describe("Refunding of users after auction", () => {
    before(() => new Promise((resolve) => setTimeout(resolve, 1000)));

    it("Cannot bid after bidding period ends!", () =>
      expect(
        program.rpc.bid(new anchor.BN(INITIALIZER_AMOUNT), {
          accounts: {
            state: state.publicKey,
            bidInfo: nonPartBidInfo,
            treasury: treasury.publicKey,
            bidder: nonParticipatingUser.publicKey,
            systemProgram: SystemProgram.programId,
          },
          signers: [nonParticipatingUser],
        })
      ).to.be.rejectedWith(/Auction is inactive./));

    it("User can get refund but not twice!", async () => {
      const balance = await getBalance(user);
      const treasuryBalance = await getBalance(treasury);
      const tx = await program.rpc.refund({
        accounts: {
          systemProgram: SystemProgram.programId,
          treasury: treasury.publicKey,
          state: state.publicKey,
          bidInfo: userBidInfo,
          bidder: user.publicKey,
        },

        signers: [treasury, user],
      });

      expect(tx).not.be.empty;
      const updatedBalance = await getBalance(user);
      const updatedTreasuryBalance = await getBalance(treasury);
      expect(balance).to.be.lessThan(updatedBalance);
      expect(treasuryBalance).to.eq(updatedTreasuryBalance + USER_AMOUNT);
      return expect(
        program.rpc.refund({
          accounts: {
            systemProgram: SystemProgram.programId,
            treasury: treasury.publicKey,
            state: state.publicKey,
            bidInfo: userBidInfo,
            bidder: user.publicKey,
          },

          signers: [user, treasury],
        })
      ).to.be.rejected;
    });

    it("Initializer can get refund!", async () => {
      const balance = await getBalance(provider.wallet as any);
      const treasuryBalance = await getBalance(treasury);
      const tx = await program.rpc.refund({
        accounts: {
          systemProgram: SystemProgram.programId,
          treasury: treasury.publicKey,
          state: state.publicKey,
          bidder: provider.wallet.publicKey,
          bidInfo: initializerBidInfo,
        },

        signers: [treasury],
      });

      expect(tx).not.to.be.empty;
      const updatedBalance = await getBalance(provider.wallet as any);
      const updatedTreasuryBalance = await getBalance(treasury);
      expect(balance).to.be.lessThan(updatedBalance);
      expect(treasuryBalance).to.eq(
        updatedTreasuryBalance + INITIALIZER_AMOUNT
      );
    });

    it("User with the highest bid cannot refund!", () =>
      expect(
        program.rpc.refund({
          accounts: {
            systemProgram: SystemProgram.programId,
            treasury: treasury.publicKey,
            state: state.publicKey,
            bidder: winner.publicKey,
            bidInfo: winnerBidInfo,
          },
          signers: [treasury, winner],
        })
      ).to.be.rejected);

    it("Non participating user cannot refund!", () =>
      expect(
        program.rpc.refund({
          accounts: {
            systemProgram: SystemProgram.programId,
            treasury: treasury.publicKey,
            bidInfo: nonPartBidInfo,
            state: state.publicKey,
            bidder: nonParticipatingUser.publicKey,
          },
          signers: [treasury, nonParticipatingUser],
        })
      ).to.be.rejected);

    it("Treasury should be empty!", () => validateBalance(treasury, 0, true));
  });
});
