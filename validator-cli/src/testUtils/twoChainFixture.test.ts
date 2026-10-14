import { createTwoChainRoute, WrongChainBlockError } from "./twoChainFixture";

describe("twoChainFixture", () => {
  it("keeps the three chains' block ranges disjoint", async () => {
    const route = createTwoChainRoute();
    const sepoliaFinalized = await route.router.provider.getBlock("finalized");
    expect(() => route.outbox.block(sepoliaFinalized.number)).toThrow(WrongChainBlockError);
    expect(() => route.inbox.block(sepoliaFinalized.number)).toThrow(WrongChainBlockError);
    const chiadoFinalized = await route.outbox.provider.getBlock("finalized");
    expect(() => route.router.block(chiadoFinalized.number)).toThrow(WrongChainBlockError);
  });

  it("rejects a pinned read at another chain's block", async () => {
    const route = createTwoChainRoute();
    const claimHashes = route.outbox.pinned((blockNumber, epoch: number) => `${blockNumber}:${epoch}`);
    const sepoliaBlock = (await route.router.provider.getBlock("finalized")).number;
    await expect(claimHashes(7, { blockTag: sepoliaBlock })).rejects.toThrow(WrongChainBlockError);
    const chiadoBlock = (await route.outbox.provider.getBlock("finalized")).number;
    await expect(claimHashes(7, { blockTag: chiadoBlock })).resolves.toBe(`${chiadoBlock}:7`);
    await expect(claimHashes(7)).resolves.toBe("latest:7");
  });

  it("derives timestamps from the head and advances consistently", async () => {
    const route = createTwoChainRoute({ now: 1_000_000_000 });
    const head = await route.outbox.provider.getBlock("latest");
    expect(head.timestamp).toBe(1_000_000_000);
    const finalized = await route.outbox.provider.getBlock("finalized");
    expect(head.timestamp - finalized.timestamp).toBe(32 * 5);
    route.outbox.advance(10);
    expect((await route.outbox.provider.getBlock("latest")).timestamp).toBe(1_000_000_050);
    expect(await route.outbox.provider.getNetwork()).toEqual({ chainId: 10200, name: "chiado" });
  });
});
