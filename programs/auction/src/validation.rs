use crate::error::AuctionError;
use anchor_lang::{prelude::*, solana_program::clock::UnixTimestamp};

pub fn validate_auction_active(end_at: UnixTimestamp) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    if now > end_at {
        return Err(error!(AuctionError::AuctionInactive));
    }
    Ok(())
}

pub fn validate_auction_inactive(end_at: UnixTimestamp) -> Result<()> {
    match validate_auction_inactive(end_at) {
        Ok(()) => Err(error!(AuctionError::AuctionActive)),
        _ => Ok(()),
    }
}
