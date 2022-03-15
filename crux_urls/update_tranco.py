# USAGE:
#        python update_tranco.py tranco_G4JK.csv

import sys
from os.path import dirname, isfile, join


OUT_FILENAMES = {
    'top10': 10,
    'top100': 10**2,
    'top1k': 10**3,
    'top10k': 10**4,
    'top100k': 10**5,
    'top1m': 10**6
}


def write_top_k(num_urls, urls, out_filename):
    print("Updating top %d file: %s" % (num_urls, out_filename))
    with open(out_filename, 'w') as f:
        for url in urls[:num_urls]:
            f.write(url + "\n")


def update_lists(tranco_list):
    urls = []
    assert isfile(tranco_list)
    out_dir = dirname(tranco_list)

    for line in open(tranco_list):
        urls.append(line.strip().split(',')[-1])

    print("Will update the top URL lists using %d urls in %s" % (
        len(urls), tranco_list))

    for filename, num_urls in OUT_FILENAMES.items():
        out_filename = join(out_dir, "%s.csv" % filename)
        write_top_k(num_urls, urls, out_filename)


if __name__ == '__main__':
    assert len(sys.argv) > 1
    update_lists(sys.argv[1])
