use anchor_lang::{
    prelude::*,
    solana_program::clock::UnixTimestamp,
    system_program::{transfer, Transfer},
};

use error::AuctionError;
use state::{Auction, BidInfo};
use validation::{validate_auction_active, validate_auction_inactive};

pub mod error;
pub mod state;
pub mod validation;

declare_id!("EVKc3smJPUvmwxRvX6ycmyNMoSssrBks4EEiFky3DmRK");

#[program]
pub mod simple_auction {
    // use anchor_lang::solana_program::clock::UnixTimestamp;

    use super::*;
    /// Creates and initialize a new state of our program
    /// Declaring the initial values of state variables/custome instruction data
    pub fn initialize(
        ctx: Context<Initialize>,
        auction_duration: i64, /* optional parameters */
    ) -> Result<()> {
        validate_auction_active(auction_duration)?;

        // ...
        let bid_state = &mut ctx.accounts.state;
        bid_state.end_at = auction_duration;
        bid_state.highest_bid = None;
        bid_state.bidder = None;
        bid_state.ended = false;
        bid_state.initializer = ctx.accounts.initializer.key();
        bid_state.treasury = ctx.accounts.treasury.key();
        Ok(())
    }
    /// Bid
    pub fn bid(ctx: Context<AuctionStart>, amount: u64) -> Result<()> {
        validate_auction_active(ctx.accounts.state.end_at)?;
        transfer(ctx.accounts.into_treasury_transfer_context(), amount)?;

        let state = &mut ctx.accounts.state;
        let bidding = &mut ctx.accounts.bid_info;
        bidding.amount = amount;
        bidding.bump = *ctx.bumps.get("bid_info").unwrap();

        if state.highest_bid.is_none()
            || (state.highest_bid.is_some() && state.highest_bid.unwrap() < amount)
        {
            state.highest_bid = Some(amount);
            state.bidder = Some(ctx.accounts.bidder.key());
        }
        // ...
        Ok(())
    }
    /// After an auction ends (determined by `auction_duration`), a seller can claim the
    /// heighest bid by calling this instruction
    pub fn end_auction(ctx: Context<AuctionEnd>) -> Result<()> {
        validate_auction_inactive(ctx.accounts.state.end_at)?;
        if ctx.accounts.state.ended {
            return Err(error!(AuctionError::AuctionEnded));
        }
        transfer(
            ctx.accounts.into_initializer_transfer_context(),
            ctx.accounts.state.highest_bid.unwrap(),
        )?;
        let state = &mut ctx.accounts.state;
        state.ended = true;
        // ...
        Ok(())
    }

    /// After an auction ends (the initializer/seller already received the winning bid),
    /// the unsuccessfull bidders can claim their money back by calling this instruction
    pub fn refund(ctx: Context<AuctionRefund>) -> Result<()> {
        let state = &ctx.accounts.state;
        validate_auction_inactive(state.end_at)?;
        if !state.ended {
            return Err(error!(AuctionError::AuctionNotEnded));
        }

        transfer(
            ctx.accounts.into_bidder_transfer_context(),
            ctx.accounts.bid_info.amount,
        )?;

        // ...
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    /// State of our auction program (up to you)
    // #[account(...)]
    #[account(
        // init, payer=seller, 
        init, payer=initializer,
        space = 8 + (32 + 32 + 8 +1 +std::mem::size_of::<Option<u64>>() + std::mem::size_of::<Option<Pubkey>>())
    )]
    pub state: Account<'info, Auction>,
    /// Account which holds tokens bidded by biders
    /// CHECK:
    // #[account(...)]
    pub treasury: AccountInfo<'info>,
    /// Seller or initializer
    // #[account(...)]
    #[account(mut)]
    pub initializer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AuctionStart<'info> {
    /// State of our auction program (up to you)
    // #[account(...)]
    #[account(mut)]
    pub state: Account<'info, Auction>,
    /// Account which holds tokens bidded by biders
    /// CHECK:
    // #[account(...)]
    #[account(mut, constraint = *treasury.key == state.treasury)]
    pub treasury: AccountInfo<'info>,

    #[account(mut)]
    pub bidder: Signer<'info>,
    #[account(
        init, payer=bidder, space= 8 + (1+8), // discriminator + (bump+amount_bidded)
        seeds=[b"bid-info", bidder.key().as_ref()],
        bump
    
    )]
    pub bid_info: Account<'info, BidInfo>,

    pub system_program: Program<'info, System>,
}

impl<'info> AuctionStart<'info> {
    // done
    pub fn into_treasury_transfer_context(
        &self,
    ) -> CpiContext<'info, 'info, 'info, 'info, Transfer<'info>> {
        let accounts = Transfer {
            from: self.bidder.to_account_info(),
            to: self.treasury.clone(),
        };
        CpiContext::new(self.system_program.to_account_info(), accounts)
    }
}

#[derive(Accounts)]
pub struct AuctionEnd<'info> {
    #[account(mut)]
    pub state: Account<'info, Auction>,

    #[account(mut, constraint=treasury.to_account_info().key() == state.treasury)]
    pub treasury: Signer<'info>,

    #[account(mut, constraint=initializer.to_account_info().key() == state.initializer)]
    pub initializer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

impl<'info> AuctionEnd<'info> {
    pub fn into_initializer_transfer_context(
        &self,
    ) -> CpiContext<'info, 'info, 'info, 'info, Transfer<'info>> {
        let accounts = Transfer {
            from: self.treasury.to_account_info(),
            to: self.initializer.to_account_info(),
        };
        CpiContext::new(self.system_program.to_account_info(), accounts)
    }
}

#[derive(Accounts)]
pub struct AuctionRefund<'info> {
    #[account()]
    pub state: Account<'info, Auction>,

    #[account(mut, constraint= treasury.to_account_info().key() == state.treasury)]
    pub treasury: Signer<'info>,
    #[account(mut, constraint=bidder.to_account_info().key() != state.bidder.unwrap())]
    pub bidder: Signer<'info>,
    #[account(mut, seeds=[b"bid-info", bidder.key().as_ref()], bump=bid_info.bump)]
    pub bid_info: Account<'info, BidInfo>,
    pub system_program: Program<'info, System>,
}

impl<'info> AuctionRefund<'info> {
    pub fn into_bidder_transfer_context(
        &self,
    ) -> CpiContext<'info, 'info, 'info, 'info, Transfer<'info>> {
        let accounts = Transfer {
            from: self.treasury.to_account_info(),
            to: self.bidder.to_account_info(),
        };
        CpiContext::new(self.system_program.to_account_info(), accounts)
    }
}
