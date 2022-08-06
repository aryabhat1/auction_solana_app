use anchor_lang::prelude::*;

#[error_code]
pub enum AuctionError {
    #[msg("Auction is actively running!")]
    AuctionActive,

    #[msg("Auction is Inactive")]
    AuctionInactive,

    #[msg("Bidder has already claimed hi/her money")]
    BidderAlreadyClaimed,

    #[msg("Auction has ended")]
    AuctionEnded,

    #[msg("Auction has not ended yet!")]
    AuctionNotEnded,
}
