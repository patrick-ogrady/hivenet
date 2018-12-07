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

To run modified simulations, download this github repo and build a new docker
image after you've made changes.
![alt text](https://github.com/uncompany/hivenet/raw/master/readmeAssets/image1.png | width=400)
![alt text](https://github.com/uncompany/hivenet/raw/master/readmeAssets/image2.png | width=400)
![alt text](https://github.com/uncompany/hivenet/raw/master/readmeAssets/image3.png | width=400)


# Install Agent (using docker)
create new directory to store all working files and IPFS (ex:hivenetruntime) and cd into
docker run -t -p 3000:3000 -p 4001:4001 -v `pwd`:/var/log/hivenet patrickogrady/hivenet:latest bash -c "npm start"

//pull docker pull patrickogrady/hivenet:latest

# Add Chrome Extension


# run simulation
docker run -t -p 3000:3000 -p 4001:4001 -v `pwd`:/var/log/hivenet patrickogrady/hivenet:latest bash -c "npm test"

# run chaos test
