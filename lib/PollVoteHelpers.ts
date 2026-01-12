import { IPersistence, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { RocketChatAssociationModel, RocketChatAssociationRecord } from '@rocket.chat/apps-engine/definition/metadata';

export interface IVoteRecord {
    pollUUID: string;
    option: string;
    userName: string;
    userId: string;
    timestamp: number;
}

function getVoteAssociation(pollUUID: string, userId: string): RocketChatAssociationRecord {
    return new RocketChatAssociationRecord(
        RocketChatAssociationModel.MISC,
        `vote#${pollUUID}#${userId}`
    );
}

function getPollVotesAssociation(pollUUID: string): RocketChatAssociationRecord {
    return new RocketChatAssociationRecord(
        RocketChatAssociationModel.MISC,
        `poll-votes#${pollUUID}`
    );
}

export async function saveVote(
    persistence: IPersistence,
    pollUUID: string,
    userId: string,
    userName: string,
    option: string
): Promise<void> {
    const voteRecord: IVoteRecord = {
        pollUUID,
        option,
        userName,
        userId,
        timestamp: Date.now(),
    };

    const userVoteAssoc = getVoteAssociation(pollUUID, userId);
    const pollVotesAssoc = getPollVotesAssociation(pollUUID);

    await persistence.updateByAssociations(
        [userVoteAssoc, pollVotesAssoc],
        voteRecord,
        true 
    );
}

export async function getUserVote(
    read: IRead,
    pollUUID: string,
    userId: string
): Promise<IVoteRecord | null> {
    const assoc = getVoteAssociation(pollUUID, userId);
    const records = await read.getPersistenceReader().readByAssociation(assoc);
    return records.length > 0 ? (records[0] as IVoteRecord) : null;
}

export async function getVotesForPoll(
    read: IRead,
    pollUUID: string
): Promise<{ [option: string]: string[] }> {
    const assoc = getPollVotesAssociation(pollUUID);
    const records = (await read.getPersistenceReader().readByAssociation(assoc)) as IVoteRecord[];

    const votes: { [option: string]: string[] } = {};

    for (const record of records) {
        if (!votes[record.option]) {
            votes[record.option] = [];
        }
        votes[record.option].push(record.userName);
    }

    return votes;
}

export async function getVoteCountsForPoll(
    read: IRead,
    pollUUID: string
): Promise<{ [option: string]: number }> {
    const votes = await getVotesForPoll(read, pollUUID);
    const counts: { [option: string]: number } = {};

    for (const option of Object.keys(votes)) {
        counts[option] = votes[option].length;
    }

    return counts;
}

export async function removeAllVotesForPoll(
    persistence: IPersistence,
    pollUUID: string
): Promise<void> {
    const assoc = getPollVotesAssociation(pollUUID);
    await persistence.removeByAssociation(assoc);
}
