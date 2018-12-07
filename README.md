# HIVENET: Autonomous and Decentralized URL Recommender System
[Technical Specification](https://docs.google.com/document/d/1Rb9EufvXj5hVDkPmee73e2DkbNGvEg_BdoDfY8KuoxA/edit?usp=sharing)

## Introduction
I built HIVENET to fulfill the "Senior Project Requirement" at Stanford
University under the supervision of my former professor, David Mazières. HIVENET
proposes a design for a decentralized StumbleUpon replacement, provides a
simulation environment to test this design, and provides a fully functional
implementation of this design.

*Full Disclosure: The code in this repository should be considered "pre-alpha"
and could still have a number of bugs. If you see an issue, make a pull request!*

## Install Software
To avoid software packaging issues, I built a Docker image containing a properly
configured "agent" (terminology further explained in attached technical
specification). This image has been uploaded to the Docker Hub under the name
`patrickogrady/hivenet`. If you haven't yet installed Docker, instructions can
be found here: https://docs.docker.com/install/

## Running Simulations
To test the underlying algorithms in HIVENET, I created a simulation
environment that allows anyone to observe how parameter changes affect HIVENET
performance. To simulate HIVENET with the standard parameters please run:
`docker run -t -p 3000:3000 -p 4001:4001 -v `pwd`:/var/log/hivenet patrickogrady/hivenet:latest bash -c "npm test"`

This command starts a Docker container to run the simulation and starts a
web server that provides a GUI view of the simulation that is available at:
`localhost:3000`.

*An overview of simulation parameters and assumptions is provided in the
technical specification.*

To run modified simulations, download this GitHub repo and build a new docker
image after you've made changes.

*A legend for the meanings of different colors in the following diagram is
provided in the technical specification.*

### Production Parameters
This simulation required a user to have provided 5 units of reputation before
considering any recommendations from peers. This sufficiently prevented the
spread of suspicious URLs from malicious hosts (*viewing suspicious URL
indicated by green node color*).
![alt text](https://github.com/uncompany/hivenet/raw/master/readmeAssets/image1.png)
### Randomly Trying Unrecommended URLs
Inspired by the BitTorrent notion of randomly unchoking peers, this simulation
explored the notion of randomly trying observed URLs when no recommendations
were available (no URL was deemed safe). This approach led to significant spread
of suspicious URL.
![alt text](https://github.com/uncompany/hivenet/raw/master/readmeAssets/image3.png)

### Production Parameters (no minimum requirement on reputation units)
This simulation explored the notion of not having a minimum observed reputation
before considering peer reputation. This exposed some users to suspicious URLs
because there is a chance that a malicious peer could discover a single useful
URL, but the probability this single useful rating affects recommendations goes
down with the requirement to observe X other useful ratings before considering.
![alt text](https://github.com/uncompany/hivenet/raw/master/readmeAssets/image2.png)

## Using HIVENET
*This assumes that the Docker image provided earlier is already downloaded.*

### Add Chrome Extension
To interface with HIVENET, the user can use the API endpoint that the "agent"
provides at port 3000 (*API reference provided in technical specification*) or
use the provided Chrome Extension. To download the chrome extension, [click here](https://github.com/uncompany/hivenet/raw/master/readmeAssets/chrome-extension.zip?raw=true).


#
create new directory to store all working files and IPFS (ex:hivenetruntime) and cd into
docker run -t -p 3000:3000 -p 4001:4001 -v `pwd`:/var/log/hivenet patrickogrady/hivenet:latest bash -c "npm start"

//pull docker pull patrickogrady/hivenet:latest

# Add Chrome Extension


# run simulation
docker run -t -p 3000:3000 -p 4001:4001 -v `pwd`:/var/log/hivenet patrickogrady/hivenet:latest bash -c "npm test"

# run chaos test
