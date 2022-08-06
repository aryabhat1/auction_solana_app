# Simple Open Auction

The general idea of the following auction program is that 
(1) everyone can send their bids during a bidding period. 

(2) The bids already include sending money/sols in order to bind the bidders to their bid. 

(3) If the highest bid is raised, the previously highest bidder can claim her/his money back at the end of an auction. 
(4) After the end of the bidding period, the program has to be called manually for the beneficiary to receive their money.

In order to run the program, please follow the steps:
(1) Build the program: anchor build

To deploy:
(1) Start the local solana-test-validator in a separate terminal
Command: anchor deploy


To carry test:
(1) Edit the program id in lib.rs and Anchor.toml
(2) Run command: anchor build
(3) Add some funds: solana airdrop 2
(4) Shutdown solana-test-validator 
(5) Run command: anchor test
