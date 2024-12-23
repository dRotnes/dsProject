# Distributed Systems Project
## Dante Rotnes

This project consists in the implementation of 3 distributed systems algorithms. The first one is a token ring algorithm to implement mutual exclusion between the peers that access the server to pose requests. The second is a gossip based data transferring algorithm (anti-entropy) to count the number of peers in the network. The last one is a totally ordered multicast (TOM) to implement a simple chat-like application.

***
### Setup
Everything was implemented with node v20+, but other versions should work aswell.
First you need to go to the root directory: `cd dsProject`
Run `npm i` to install the necessary packages.
And you're ready to go!

### Token Ring
To start the token ring algorit