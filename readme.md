# Distributed Systems Project
## Dante Rotnes

This project consists in the implementation of 3 distributed systems algorithms. The first one is a token ring algorithm to implement mutual exclusion between the peers that access the server to pose requests. The second is a gossip based data transferring algorithm (anti-entropy) to count the number of peers in the network. The last one is a totally ordered multicast (TOM) to implement a simple chat-like application.

***
### Setup
Everything was implemented with node v20+, but other versions should work aswell.
First you need to go to the root directory: `cd dsProject`
Run `npm i` to install the necessary packages.
And you're ready to go!
***

### Token Ring
To start the project, first go to the directory `cd tokenRing`.
To run a peer you must run the command:
```
node peer.js <nextPeerIp> <serverIp>
```
To run the calculator server:
```
node calculatorMulti.js <nextPeerIp> <serverIp>
```
Then to finally inject the token in the ring you must the `app.js` script on the same machine as one of the peers:
```
node app.js
```

***
### P2P (Anti-entropy)
To start the project, firt go to the directory `cd p2p`.
To run a peer you must run the command:
```
node peer.js [peerIps]
```
The `peerIps` parameter is the different neighbors ips separated by regular spaces.
The algorithm starts as soon as the nodes are connected.

***
### Chat (TOM)
To start the project, firt go to the directory `cd chat`.
To run a peer you must run the command:
```
node peer.js [peerIps] 
```
OBS: It's important that in the peerIps, it includes the ip of the own machine.
The algorithm starts as soon as the nodes are connected.

***
### Important notes
In the `token ring` and `chat` projects, once a node receives am interruption signal, it executes a graceful shutdown of the whole network. As for the `p2p` project, the neighbors will simply remove the dead peer from its neighbors map.